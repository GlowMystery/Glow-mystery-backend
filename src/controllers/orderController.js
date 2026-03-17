const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const Razorpay = require('razorpay');

// @route   POST api/orders
// @desc    Create new order
// @access  Private
const createOrder = async (req, res) => {
    try {
        const { orderItems, totalAmount, shippingAddress } = req.body;

        if (orderItems && orderItems.length === 0) {
            return res.status(400).json({ message: 'No order items' });
        }

        // Validate stock before proceeding
        const productIds = orderItems.map(item => item.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } }
        });

        for (const item of orderItems) {
            const product = products.find(p => p.id === item.productId);
            if (!product) {
                return res.status(404).json({ message: `Product not found.` });
            }
            if (product.stock < item.quantity) {
                return res.status(400).json({ message: `Insufficient stock for ${product.name}.` });
            }
        }

        // Ensure we have correct prices and calculate total again to prevent tampering
        // For simplicity, we trust the front-end total here, but in production, calculate from DB

        // Create the order with nested items
        const order = await prisma.order.create({
            data: {
                totalAmount: parseFloat(totalAmount),
                userId: req.user.id,
                shippingAddress: shippingAddress || null,
                orderItems: {
                    create: orderItems.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        price: parseFloat(item.price)
                    }))
                }
            },
            include: {
                orderItems: true,
                user: {
                    select: { name: true, email: true }
                }
            }
        });

        // --- REALTIME: Notify Admin ---
        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('new_order', {
                message: 'New order received!',
                orderId: order.id,
                totalAmount: order.totalAmount,
                customerName: order.user.name
            });
        }

        res.status(201).json(order);
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ message: 'Server error creating order' });
    }
};

// @route   GET api/orders
// @desc    Get all orders (Admin only)
// @access  Private/Admin
const getOrders = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Not authorized as an admin' });
        }

        const orders = await prisma.order.findMany({
            include: {
                user: {
                    select: { id: true, name: true, email: true }
                },
                orderItems: {
                    include: {
                        product: { select: { name: true, imageUrl: true } }
                    }
                },
                returnRequest: true
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Server error fetching orders' });
    }
};

// @route   GET api/orders/myorders
// @desc    Get logged in user orders
// @access  Private
const getMyOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const { search, status, timeframe } = req.query;

        // Base where clause
        let where = { userId: req.user.id };

        // Apply status filter
        if (status) {
            // Note: Since the DB enum expects strictly 'SHIPPED', 'DELIVERED', etc.
            // Ensure frontend passes the correct upper-case keys or map them here
            const validStatuses = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
            const statusUpper = status.toUpperCase();
            if (validStatuses.includes(statusUpper)) {
                where.status = statusUpper;
            }
        }

        // Apply timeframe filter
        if (timeframe) {
            const now = new Date();
            if (timeframe === 'last30') {
                const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
                where.createdAt = { gte: thirtyDaysAgo };
            } else if (timeframe === '2024') {
                where.createdAt = {
                    gte: new Date('2024-01-01T00:00:00.000Z'),
                    lt: new Date('2025-01-01T00:00:00.000Z')
                };
            } else if (timeframe === '2023') {
                where.createdAt = {
                    gte: new Date('2023-01-01T00:00:00.000Z'),
                    lt: new Date('2024-01-01T00:00:00.000Z')
                };
            } else if (timeframe === 'older') {
                where.createdAt = { lt: new Date('2023-01-01T00:00:00.000Z') };
            }
        }

        // Handle search
        if (search) {
            // Check if search is a number (Order ID)
            const searchId = parseInt(search);
            if (!isNaN(searchId)) {
                where.id = searchId;
            } else {
                // Search by product name in orderItems
                where.orderItems = {
                    some: {
                        product: {
                            name: {
                                contains: search,
                                mode: 'insensitive' // case-insensitive search
                            }
                        }
                    }
                };
            }
        }

        const [orders, totalOrders] = await Promise.all([
            prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    orderItems: {
                        include: {
                            product: { select: { name: true, imageUrl: true } }
                        }
                    },
                    returnRequest: true
                }
            }),
            prisma.order.count({ where })
        ]);

        const totalPages = Math.ceil(totalOrders / limit);

        res.json({
            orders,
            pagination: {
                page,
                limit,
                totalPages,
                totalOrders
            }
        });
    } catch (error) {
        console.error('Error fetching user orders:', error);
        res.status(500).json({ message: 'Server error fetching user orders' });
    }
};

// @route   GET api/orders/myorders/:id
// @desc    Get order by ID
// @access  Private
const getOrderById = async (req, res) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                user: { select: { name: true, email: true, phone: true, address: true } },
                orderItems: {
                    include: {
                        product: { select: { name: true, imageUrl: true } }
                    }
                },
                returnRequest: true
            }
        });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Make sure the logged in user actually owns this order (or is an admin)
        if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Not authorized to view this order' });
        }

        res.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ message: 'Server error fetching order' });
    }
};

// @route   PUT api/orders/:id/deliver
// @desc    Update order to delivered/shipped status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Not authorized as an admin' });
        }

        const { status } = req.body;

        // If status is transitioning to RETURNED, dispatch a Razorpay refund
        if (status === 'RETURNED') {
            const existingOrder = await prisma.order.findUnique({
                where: { id: parseInt(req.params.id) }
            });

            if (existingOrder && existingOrder.razorpayPaymentId) {
                try {
                    const razorpay = new Razorpay({
                        key_id: process.env.RAZORPAY_KEY_ID,
                        key_secret: process.env.RAZORPAY_KEY_SECRET,
                    });

                    // Try to issue a full refund against the original Payment ID
                    await razorpay.payments.refund(existingOrder.razorpayPaymentId, {
                        "amount": Math.round(existingOrder.totalAmount * 100),
                        "speed": "normal"
                    });
                    console.log(`Successfully issued refund for Order ${existingOrder.id} (Payment ID: ${existingOrder.razorpayPaymentId})`);
                } catch (refundError) {
                    console.error('Razorpay Refund Error:', refundError);
                }
            } else {
                console.warn(`Order ${req.params.id} marked RETURNED but lacks razorpayPaymentId. Manual refund required.`);
            }
        }

        const order = await prisma.order.update({
            where: { id: parseInt(req.params.id) },
            data: { status },
            include: { user: true, returnRequest: true }
        });

        // Sync ReturnRequest state if applicable
        if (order.returnRequest) {
            let returnStatusMapped = null;
            if (status === 'RETURN_ACCEPTED') returnStatusMapped = 'ACCEPTED';
            else if (status === 'OUT_FOR_PICKUP') returnStatusMapped = 'OUT_FOR_PICKUP';
            else if (status === 'RETURNED') returnStatusMapped = 'RETURNED';

            if (returnStatusMapped && order.returnRequest.status !== returnStatusMapped) {
                await prisma.returnRequest.update({
                    where: { id: order.returnRequest.id },
                    data: { status: returnStatusMapped }
                });
            }
        }

        // Email Notification
        try {
            const emailService = require('../utils/emailService');
            await emailService.sendOrderStatusEmail(order.user.email, order.user.name, order.id, order.status);
        } catch (err) {
            console.warn('Status email failed to send:', err.message);
        }

        // Notify user via Socket.io if they are connected
        const io = req.app.get('io');
        if (io) {
            io.emit('order_updated'); // For Admin dashboard
            io.emit(`order_status_${order.id}`, {
                message: 'Order status updated',
                status: order.status
            });
        }

        res.json(order);
    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({ message: 'Server error updating order' });
    }
};

// @route   POST api/orders/:id/return
// @desc    Submit a return request
// @access  Private
const requestReturn = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const { reason, description } = req.body;

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { returnRequest: true }
        });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.userId !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized for this order' });
        }

        if (order.status !== 'DELIVERED') {
            return res.status(400).json({ message: 'Only delivered orders can be returned' });
        }

        if (order.returnRequest) {
            return res.status(400).json({ message: 'Return request already exists for this order' });
        }

        let uploadedImages = [];

        // Handle possible multiple images via multer
        if (req.files && req.files.length > 0) {
            const cloudinary = require('../utils/cloudinary');
            const streamifier = require('streamifier');

            const uploadPromises = req.files.map(file => {
                return new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { folder: 'glow_mystery_returns' },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result.secure_url);
                        }
                    );
                    streamifier.createReadStream(file.buffer).pipe(uploadStream);
                });
            });

            uploadedImages = await Promise.all(uploadPromises);
        }

        const returnReq = await prisma.returnRequest.create({
            data: {
                orderId,
                reason,
                description,
                images: uploadedImages
            }
        });

        const io = req.app.get('io');
        if (io) io.emit('order_updated');

        res.status(201).json(returnReq);

    } catch (error) {
        console.error('Error submitting return request:', error);
        res.status(500).json({ message: 'Server error submitting return request' });
    }
};

// @route   PUT api/orders/return/:returnId/status
// @desc    Update return request status
// @access  Private/Admin
const updateReturnStatus = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Not authorized as an admin' });
        }

        const returnId = parseInt(req.params.returnId);
        const { status, adminReason } = req.body;

        const returnReq = await prisma.returnRequest.findUnique({
            where: { id: returnId }
        });

        if (!returnReq) {
            return res.status(404).json({ message: 'Return request not found' });
        }

        const updatedReturn = await prisma.returnRequest.update({
            where: { id: returnId },
            data: {
                status,
                adminReason: adminReason || null
            }
        });

        // Sync parent Order status implicitly to match Return progress
        let syncOrderStatus = null;
        if (status === 'ACCEPTED') syncOrderStatus = 'RETURN_ACCEPTED';
        else if (status === 'OUT_FOR_PICKUP') syncOrderStatus = 'OUT_FOR_PICKUP';
        else if (status === 'RETURNED') syncOrderStatus = 'RETURNED';

        if (syncOrderStatus) {
            await prisma.order.update({
                where: { id: returnReq.orderId },
                data: { status: syncOrderStatus }
            });

            // Fire off a refund here as well since Admin might use the secondary modal
            if (status === 'RETURNED') {
                const finishedOrder = await prisma.order.findUnique({
                    where: { id: returnReq.orderId }
                });
                if (finishedOrder && finishedOrder.razorpayPaymentId) {
                    try {
                        const razorpay = new Razorpay({
                            key_id: process.env.RAZORPAY_KEY_ID,
                            key_secret: process.env.RAZORPAY_KEY_SECRET,
                        });
                        await razorpay.payments.refund(finishedOrder.razorpayPaymentId, {
                            "amount": Math.round(finishedOrder.totalAmount * 100),
                            "speed": "normal"
                        });
                        console.log(`Successfully issued refund for Order ${finishedOrder.id} (Payment ID: ${finishedOrder.razorpayPaymentId})`);
                    } catch (e) { console.error('Razorpay Refund Error via Modal:', e); }
                }
            }
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('order_updated');
            io.emit(`order_status_${returnReq.orderId}`, { message: 'Return Status Updated', status: syncOrderStatus || status });
        }

        res.json(updatedReturn);

    } catch (error) {
        console.error('Error updating return request:', error);
        res.status(500).json({ message: 'Server error updating return status' });
    }
};

// @route   DELETE api/orders/:id/pending
// @desc    Delete a pending order if payment failed/cancelled
// @access  Private
const deletePendingOrder = async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);

        const order = await prisma.order.findUnique({
            where: { id: orderId }
        });

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Not authorized for this order' });
        }

        if (order.status !== 'PENDING') {
            return res.status(400).json({ message: 'Only PENDING orders can be deleted.' });
        }

        // Delete related order items first
        await prisma.orderItem.deleteMany({
            where: { orderId: orderId }
        });

        // Delete the order itself
        await prisma.order.delete({
            where: { id: orderId }
        });

        res.json({ message: 'Pending order deleted safely.' });
    } catch (error) {
        console.error('Error deleting pending order:', error);
        res.status(500).json({ message: 'Server error deleting pending order' });
    }
};

module.exports = {
    createOrder,
    getOrders,
    getMyOrders,
    getOrderById,
    updateOrderStatus,
    requestReturn,
    updateReturnStatus,
    deletePendingOrder
};

