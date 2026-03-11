const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// @route   GET api/admin/dashboard
// @desc    Get admin dashboard analytics
// @access  Private/Admin
const getDashboardStats = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Not authorized as an admin' });
        }

        // Total Users
        const totalUsers = await prisma.user.count({ where: { role: 'USER' } });

        // Total Orders
        const totalOrders = await prisma.order.count();

        // Total Earnings (sum of PAID orders)
        const paidOrders = await prisma.order.findMany({
            where: { status: 'PAID' }
        });
        const totalEarnings = paidOrders.reduce((acc, order) => acc + order.totalAmount, 0);

        // Most Sold Products
        // Using group by on OrderItems to find sum of quantities per product
        const topProducts = await prisma.orderItem.groupBy({
            by: ['productId'],
            _sum: {
                quantity: true,
            },
            orderBy: {
                _sum: {
                    quantity: 'desc',
                },
            },
            take: 5,
        });

        // Fetch product details for top products
        const mostSoldProducts = await Promise.all(
            topProducts.map(async (tp) => {
                const product = await prisma.product.findUnique({
                    where: { id: tp.productId },
                    select: { name: true, price: true }
                });
                return {
                    ...product,
                    totalSold: tp._sum.quantity
                };
            })
        );

        res.json({
            totalUsers,
            totalOrders,
            totalEarnings,
            mostSoldProducts
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: 'Server error fetching dashboard stats' });
    }
};

const bcrypt = require('bcrypt');

// --- USER MANAGEMENT ---

// @route   GET api/admin/users
const getAllUsers = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Not authorized' });
        const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, phone: true, createdAt: true } });
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Server error fetching users' });
    }
};

// @route   POST api/admin/users
const addUser = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Not authorized' });
        const { name, email, password, role } = req.body;

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ message: 'Email already in use' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await prisma.user.create({
            data: { name, email, password: hashedPassword, role: role || 'USER' },
            select: { id: true, name: true, email: true, role: true }
        });
        res.status(201).json({ message: 'User created successfully', user: newUser });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ message: 'Server error adding user' });
    }
};

// @route   PUT api/admin/users/:id
const updateUser = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Not authorized' });
        const { name, email, role } = req.body;

        const updatedUser = await prisma.user.update({
            where: { id: parseInt(req.params.id) },
            data: { name, email, role },
            select: { id: true, name: true, email: true, role: true }
        });
        res.json({ message: 'User updated successfully', user: updatedUser });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Server error updating user' });
    }
};

// @route   DELETE api/admin/users/:id
const deleteUser = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Not authorized' });
        await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Server error deleting user' });
    }
};


// --- REVIEW MANAGEMENT ---

// @route   GET api/admin/reviews
const getAllReviews = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Not authorized' });
        const reviews = await prisma.review.findMany({
            include: {
                user: { select: { name: true, email: true } },
                product: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(reviews);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ message: 'Server error fetching reviews' });
    }
};

// @route   DELETE api/admin/reviews/:id
const deleteReview = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Not authorized' });
        await prisma.review.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: 'Review deleted successfully' });
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ message: 'Server error deleting review' });
    }
};

module.exports = {
    getDashboardStats,
    getAllUsers,
    addUser,
    updateUser,
    deleteUser,
    getAllReviews,
    deleteReview
};
