const crypto = require('crypto');
const Razorpay = require('razorpay');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Initialize Razorpay once
let razorpayInstance = null;
const getRazorpay = () => {
    if (!razorpayInstance && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        razorpayInstance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
    }
    return razorpayInstance;
};

// @route   POST api/payments/create-checkout-session
// We keep the old name to minimize route changes, but this creates a Razorpay Order
const createCheckoutSession = async (req, res) => {
    try {
        const { orderItems, orderId } = req.body;
        const razorpay = getRazorpay();

        if (!razorpay) {
            // Fallback for missing keys (e.g. COD mode or not configured)
            return res.status(500).json({ message: 'Razorpay keys not configured' });
        }

        // Calculate amount in backend safely
        let amount = 0;
        for (const item of orderItems) {
            amount += item.price * item.quantity;
        }

        const options = {
            amount: Math.round(amount * 100), // paise
            currency: 'INR',
            receipt: `rcptid_${orderId}`,
        };

        const rzpOrder = await razorpay.orders.create(options);

        // Update DB with razorpay order ID
        await prisma.order.update({
            where: { id: parseInt(orderId) },
            data: { razorpayOrderId: rzpOrder.id }
        });

        // Send back the order id and amount for the frontend checkout script
        res.json({ id: rzpOrder.id, amount: rzpOrder.amount, currency: rzpOrder.currency, orderId });
    } catch (error) {
        console.error('Error creating razorpay order:', error);
        res.status(500).json({ message: 'Server error creating checkout session' });
    }
};

// @route   POST api/payments/webhook
// @desc    Razorpay webhook to capture successful payments
const stripeWebhook = async (req, res) => {
    // Keep name `stripeWebhook` so routes file doesn't need to change
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // If webhook secret isn't set, just ack
    if (!secret) return res.send('ok');

    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    if (digest === req.headers['x-razorpay-signature']) {
        const event = req.body.event;

        if (event === 'payment.captured' || event === 'order.paid') {
            const paymentEntity = req.body.payload.payment.entity;
            const rzpOrderId = paymentEntity.order_id;
            const rzpPaymentId = paymentEntity.id;

            try {
                // Find order by razorpayOrderId
                const order = await prisma.order.findUnique({
                    where: { razorpayOrderId: rzpOrderId },
                    include: { orderItems: true, user: true }
                });

                if (order && order.status === 'PENDING') {
                    const updateData = {
                        status: 'PAID',
                        razorpayPaymentId: rzpPaymentId
                    };

                    const updatedOrder = await prisma.order.update({
                        where: { id: order.id },
                        data: updateData,
                        include: { user: true, orderItems: true }
                    });

                    // Decrement Stock
                    for (const item of updatedOrder.orderItems) {
                        try {
                            await prisma.product.update({
                                where: { id: item.productId },
                                data: { stock: { decrement: item.quantity } }
                            });
                        } catch (stockErr) {
                            console.error(`Failed to decrement stock for Product ${item.productId}:`, stockErr);
                        }
                    }

                    const io = req.app.get('io');
                    if (io) {
                        io.emit('product_updated');
                        io.emit('order_updated');
                        io.emit(`order_status_${updatedOrder.id}`, { message: 'Order Paid', status: 'PAID' });
                    }

                    // Send Invoice Email
                    try {
                        const emailService = require('../utils/emailService');
                        await emailService.sendInvoiceEmail(updatedOrder.user.email, updatedOrder.user.name, updatedOrder);
                    } catch (err) {
                        console.warn('Invoice email failed to send:', err.message);
                    }
                }
            } catch (err) {
                console.error('Error updating order on razorpay webhook:', err);
            }
        }
        res.send({ status: 'ok' });
    } else {
        res.status(400).send('Invalid signature');
    }
};

const verifySession = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId, shippingAddress } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            const order = await prisma.order.findUnique({
                where: { id: parseInt(orderId) },
                include: { orderItems: true }
            });

            if (order && order.status === 'PENDING') {
                const updatedOrder = await prisma.order.update({
                    where: { id: parseInt(orderId) },
                    data: {
                        status: 'PAID',
                        razorpayPaymentId: razorpay_payment_id,
                        ...(shippingAddress && { 
                            shippingName: shippingAddress.name,
                            shippingPhone: shippingAddress.phone,
                            shippingStreet: shippingAddress.street,
                            shippingCity: shippingAddress.city,
                            shippingState: shippingAddress.state,
                            shippingZip: shippingAddress.zip,
                        })
                    },
                    include: { user: true, orderItems: true }
                });

                // Decrement Stock
                for (const item of updatedOrder.orderItems) {
                    try {
                        await prisma.product.update({
                            where: { id: item.productId },
                            data: { stock: { decrement: item.quantity } }
                        });
                    } catch (e) {
                        console.error('Stock decrement fallback failed:', e);
                    }
                }

                // Send Email
                const emailService = require('../utils/emailService');
                emailService.sendInvoiceEmail(updatedOrder.user.email, updatedOrder.user.name, updatedOrder).catch(e => console.error(e));

                const io = req.app.get('io');
                if (io) {
                    io.emit('product_updated');
                    io.emit('order_updated');
                    io.emit(`order_status_${updatedOrder.id}`, { message: 'Order Paid', status: 'PAID' });
                }

                return res.json({ success: true, message: 'Order verified and updated.' });
            }
            return res.json({ success: true, message: 'Order already processed.' });
        } else {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }
    } catch (error) {
        console.error('Error verifying razorpay session:', error);
        res.status(500).json({ message: 'Server error verifying session' });
    }
};

module.exports = {
    createCheckoutSession,
    stripeWebhook,
    verifySession
};
