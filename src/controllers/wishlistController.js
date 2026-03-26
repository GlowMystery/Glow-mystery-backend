const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.toggleWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.user.id; // from auth middleware

        if (!productId) {
            return res.status(400).json({ message: "Product ID is required" });
        }

        const existingItem = await prisma.wishlistItem.findUnique({
            where: {
                userId_productId: {
                    userId: parseInt(userId),
                    productId: parseInt(productId)
                }
            }
        });

        if (existingItem) {
            // Remove from wishlist
            await prisma.wishlistItem.delete({
                where: { id: existingItem.id }
            });
            return res.status(200).json({ message: "Product removed from wishlist", action: 'removed' });
        } else {
            // Add to wishlist
            const newItem = await prisma.wishlistItem.create({
                data: {
                    userId: parseInt(userId),
                    productId: parseInt(productId)
                },
                include: {
                    product: true // Return product details with the response
                }
            });
            return res.status(201).json({ message: "Product added to wishlist", action: 'added', item: newItem });
        }
    } catch (error) {
        console.error("Error toggling wishlist:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.getWishlist = async (req, res) => {
    try {
        const userId = req.user.id;
        const wishlistItems = await prisma.wishlistItem.findMany({
            where: { userId: parseInt(userId) },
            include: {
                product: true // we need product details to display on the wishlist page
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.status(200).json(wishlistItems);
    } catch (error) {
        console.error("Error fetching wishlist:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
