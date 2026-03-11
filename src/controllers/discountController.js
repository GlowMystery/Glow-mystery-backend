const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/discounts  (Admin: all | Public: active only via query)
const getDiscounts = async (req, res) => {
    try {
        const isAdmin = req.user?.role === 'ADMIN';
        const where = isAdmin ? {} : { isActive: true };

        const discounts = await prisma.discount.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        res.json(discounts);
    } catch (err) {
        console.error('Error fetching discounts:', err);
        res.status(500).json({ message: 'Server error fetching discounts' });
    }
};

// POST /api/discounts  (Admin only)
const createDiscount = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Not authorized' });

        const { code, type, value, minOrderAmount, maxUses, isActive, expiresAt } = req.body;

        if (!code || !value) return res.status(400).json({ message: 'Code and value are required' });

        const discount = await prisma.discount.create({
            data: {
                code: code.toUpperCase().trim(),
                type: type || 'PERCENTAGE',
                value: parseFloat(value),
                minOrderAmount: parseFloat(minOrderAmount) || 0,
                maxUses: maxUses ? parseInt(maxUses) : null,
                isActive: isActive !== undefined ? Boolean(isActive) : true,
                expiresAt: expiresAt ? new Date(expiresAt) : null
            }
        });
        res.status(201).json(discount);
    } catch (err) {
        if (err.code === 'P2002') return res.status(400).json({ message: 'Discount code already exists' });
        console.error('Error creating discount:', err);
        res.status(500).json({ message: 'Server error creating discount' });
    }
};

// PUT /api/discounts/:id  (Admin only)
const updateDiscount = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Not authorized' });

        const { code, type, value, minOrderAmount, maxUses, isActive, expiresAt } = req.body;

        const discount = await prisma.discount.update({
            where: { id: parseInt(req.params.id) },
            data: {
                code: code?.toUpperCase().trim(),
                type,
                value: parseFloat(value),
                minOrderAmount: parseFloat(minOrderAmount) || 0,
                maxUses: maxUses ? parseInt(maxUses) : null,
                isActive: Boolean(isActive),
                expiresAt: expiresAt ? new Date(expiresAt) : null
            }
        });
        res.json(discount);
    } catch (err) {
        if (err.code === 'P2002') return res.status(400).json({ message: 'Discount code already exists' });
        console.error('Error updating discount:', err);
        res.status(500).json({ message: 'Server error updating discount' });
    }
};

// DELETE /api/discounts/:id  (Admin only)
const deleteDiscount = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') return res.status(403).json({ message: 'Not authorized' });

        await prisma.discount.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: 'Discount deleted successfully' });
    } catch (err) {
        console.error('Error deleting discount:', err);
        res.status(500).json({ message: 'Server error deleting discount' });
    }
};

// POST /api/discounts/validate  (Authenticated users — apply coupon at checkout)
const validateDiscount = async (req, res) => {
    try {
        const { code, orderTotal } = req.body;
        if (!code) return res.status(400).json({ message: 'Code is required' });

        const discount = await prisma.discount.findUnique({ where: { code: code.toUpperCase().trim() } });

        if (!discount || !discount.isActive) return res.status(404).json({ message: 'Invalid or inactive discount code' });
        if (discount.expiresAt && new Date() > discount.expiresAt) return res.status(400).json({ message: 'Discount code has expired' });
        if (discount.maxUses && discount.usedCount >= discount.maxUses) return res.status(400).json({ message: 'Discount usage limit reached' });
        if (orderTotal < discount.minOrderAmount) return res.status(400).json({ message: `Minimum order amount ₹${discount.minOrderAmount} required` });

        const discountAmount = discount.type === 'PERCENTAGE'
            ? (orderTotal * discount.value) / 100
            : discount.value;

        res.json({
            valid: true,
            discountId: discount.id,
            discountCode: discount.code,
            type: discount.type,
            value: discount.value,
            discountAmount: Math.min(discountAmount, orderTotal)
        });
    } catch (err) {
        console.error('Error validating discount:', err);
        res.status(500).json({ message: 'Server error validating discount' });
    }
};

module.exports = { getDiscounts, createDiscount, updateDiscount, deleteDiscount, validateDiscount };
