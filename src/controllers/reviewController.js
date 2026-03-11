const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// @route   POST /api/reviews/:productId
// @desc    Add or update review
// @access  Private
const createReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const productId = Number(req.params.productId);
        const userId = req.user.id;

        // Validation
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                message: "Rating must be between 1 and 5"
            });
        }

        // Check if product exists
        const product = await prisma.product.findUnique({
            where: { id: productId }
        });

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        // Check existing review
        const existingReview = await prisma.review.findUnique({
            where: {
                userId_productId: {
                    userId,
                    productId
                }
            }
        });

        let review;

        if (existingReview) {
            return res.status(400).json({
                message: "You are already reviewed"
            });
        } else {
            // Create review
            review = await prisma.review.create({
                data: {
                    rating: Number(rating),
                    comment,
                    userId,
                    productId
                }
            });
        }

        return res.status(200).json({
            success: true,
            review
        });

    } catch (error) {
        console.error("Review Error:", error);
        return res.status(500).json({
            message: "Server error adding review"
        });
    }
};

// @route   GET /api/reviews/product/:productId
// @desc    Get all reviews for a product
// @access  Public
const getProductReviews = async (req, res) => {
    try {
        const productId = Number(req.params.productId);

        const reviews = await prisma.review.findMany({
            where: { productId },
            include: {
                user: {
                    select: { name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return res.status(200).json(reviews);
    } catch (error) {
        console.error("Fetch Reviews Error:", error);
        return res.status(500).json({
            message: "Server error fetching reviews"
        });
    }
};

module.exports = { createReview, getProductReviews };