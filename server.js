const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createServer } = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*', // For development. Adjust for production
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

// Basic Route for testing
app.get('/', (req, res) => {
    res.send('Glow Mystery Backend API is running');
});

// Socket.io integration
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join_admin_room', () => {
        socket.join('admin_room');
        console.log(`User ${socket.id} joined admin_room`);
    });

    // User Room for Chat
    socket.on('join_user_room', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined their room: ${socket.id}`);
    });

    // Handle Chat Messages
    socket.on('send_message', async (data) => {
        try {
            // In production, save message to Prisma DB here first
            if (data.role === 'ADMIN') {
                // Admin replying to a specific user
                if (data.targetUserId) {
                    io.to(`user_${data.targetUserId}`).emit('receive_message', data);
                    socket.emit('receive_message', data);
                }
            } else {
                // User sending msg to Admin
                io.to('admin_room').emit('receive_message', data);
                socket.emit('receive_message', data);
            }
        } catch (err) {
            console.error('Chat error:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Make io accessible to routes via req.app.get('io')
app.set('io', io);

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const productRoutes = require('./src/routes/productRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const reviewRoutes = require('./src/routes/reviewRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const discountRoutes = require('./src/routes/discountRoutes');

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/discounts', discountRoutes);
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
