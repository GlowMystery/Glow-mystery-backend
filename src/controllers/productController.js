const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// @route   GET api/products
// @desc    Get all products
// @access  Public
const getProducts = async (req, res) => {
    try {
        const products = await prisma.product.findMany();
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Server error fetching products' });
    }
};

// @route   GET api/products/:id
// @desc    Get single product by ID
// @access  Public
const getProductById = async (req, res) => {
    try {
        const product = await prisma.product.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                reviews: {
                    include: {
                        user: {
                            select: { name: true }
                        }
                    }
                }
            }
        });

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ message: 'Server error fetching product' });
    }
};

// @route   POST api/products
// @desc    Create a product
// @access  Private/Admin
const createProduct = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Not authorized as an admin' });
        }

        const { name, description, price, stock, imageUrl } = req.body;
        const productData = {
            name,
            description,
            price: parseFloat(price),
            stock: parseInt(stock),
            imageUrl: imageUrl || null
        };

        if (req.file) {
            const cloudinary = require('../utils/cloudinary');
            const streamifier = require('streamifier');

            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'glow_mystery_products' },
                async (error, result) => {
                    if (error) {
                        console.error('Cloudinary Error:', error);
                        return res.status(500).json({ message: 'Error uploading image' });
                    }

                    productData.imageUrl = result.secure_url;
                    const product = await prisma.product.create({ data: productData });

                    const io = req.app.get('io');
                    if (io) io.emit('product_updated', { message: 'New product created', productId: product.id });

                    return res.status(201).json(product);
                }
            );

            streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
            return;
        }

        const product = await prisma.product.create({ data: productData });

        const io = req.app.get('io');
        if (io) io.emit('product_updated', { message: 'New product created', productId: product.id });

        res.status(201).json(product);
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ message: 'Server error creating product' });
    }
};

// @route   PUT api/products/:id
// @desc    Update a product
// @access  Private/Admin
const updateProduct = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Not authorized as an admin' });
        }

        const { name, description, price, stock, imageUrl } = req.body;
        const productId = parseInt(req.params.id);

        let updateData = {};
        if (name) updateData.name = name;
        if (description) updateData.description = description;
        if (price !== undefined) updateData.price = parseFloat(price);
        if (stock !== undefined) updateData.stock = parseInt(stock);
        if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

        if (req.file) {
            const cloudinary = require('../utils/cloudinary');
            const streamifier = require('streamifier');

            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'glow_mystery_products' },
                async (error, result) => {
                    if (error) {
                        console.error('Cloudinary Error:', error);
                        return res.status(500).json({ message: 'Error uploading image' });
                    }

                    updateData.imageUrl = result.secure_url;
                    const product = await prisma.product.update({
                        where: { id: productId },
                        data: updateData
                    });

                    const io = req.app.get('io');
                    if (io) io.emit('product_updated', { message: 'Product updated', productId: product.id });

                    return res.json(product);
                }
            );

            streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
            return;
        }

        const product = await prisma.product.update({
            where: { id: productId },
            data: updateData
        });

        const io = req.app.get('io');
        if (io) io.emit('product_updated', { message: 'Product updated', productId: product.id });

        res.json(product);
    } catch (error) {
        console.error('Error updating product:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(500).json({ message: 'Server error updating product' });
    }
};

// @route   DELETE api/products/:id
// @desc    Delete a product
// @access  Private/Admin
const deleteProduct = async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Not authorized as an admin' });
        }

        await prisma.product.delete({
            where: { id: parseInt(req.params.id) }
        });

        const io = req.app.get('io');
        if (io) io.emit('product_updated', { message: 'Product deleted', productId: parseInt(req.params.id) });

        res.json({ message: 'Product removed' });
    } catch (error) {
        console.error('Error deleting product:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(500).json({ message: 'Server error deleting product' });
    }
};

// @route   POST api/products/:id/reviews
// @desc    Create new review
// @access  Private
const addProductReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const productId = parseInt(req.params.id);
        const userId = req.user.id;

        // Validation
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        // Optional: Check if user actually ordered this product.
        // For now, we just check if product exists.
        const product = await prisma.product.findUnique({
            where: { id: productId }
        });

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Check if user already reviewed
        const alreadyReviewed = await prisma.review.findFirst({
            where: {
                productId,
                userId
            }
        });

        if (alreadyReviewed) {
            return res.status(400).json({ message: 'Product already reviewed' });
        }

        const review = await prisma.review.create({
            data: {
                rating: parseInt(rating),
                comment,
                productId,
                userId
            }
        });

        const io = req.app.get('io');
        if (io) io.emit('product_updated', { message: 'New review added', productId });

        res.status(201).json({ message: 'Review added', review });
    } catch (error) {
        console.error('Error adding review:', error);
        res.status(500).json({ message: 'Server error adding review' });
    }
};

module.exports = {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    addProductReview
};
