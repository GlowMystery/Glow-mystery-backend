const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// In-memory store for pending registrations. E.g:
// 'user@email.com' => { name, email, hashedPassword, otp, otpExpiry }
const pendingRegistrations = new Map();

const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate 6-digit OTP for email verification
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // Set expiry to 15 mins from now
        const otpExpiry = new Date(Date.now() + 15 * 60000);

        // Store user in memory temporarily
        pendingRegistrations.set(email, {
            name,
            email,
            hashedPassword,
            otp,
            otpExpiry
        });

        // Send Registration Email safely
        try {
            const emailService = require('../utils/emailService');
            await emailService.sendRegistrationOTPEmail(email, name, otp);
        } catch (err) {
            console.warn('Registration email failed to send, continuing...', err.message);
        }

        res.status(201).json({
            message: 'User registration processing. Please verify your email using the OTP sent.',
            email: email
        });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

const verifyEmail = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const pendingUser = pendingRegistrations.get(email);

        if (!pendingUser) {
            // Check if they are already in DB
            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                return res.status(400).json({ message: 'User is already registered and verified. Please log in.' });
            }
            return res.status(404).json({ message: 'Registration session expired or not found. Please register again.' });
        }

        if (pendingUser.otp !== otp || new Date() > pendingUser.otpExpiry) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // OTP is valid. Create the actual user in DB now
        await prisma.user.create({
            data: {
                name: pendingUser.name,
                email: pendingUser.email,
                password: pendingUser.hashedPassword,
                role: 'USER',
            }
        });

        // Clear them from memory
        pendingRegistrations.delete(email);

        res.json({ message: 'Email verified successfully. You can now log in.' });
    } catch (err) {
        console.error('Email Verification Error:', err);
        res.status(500).json({ message: 'Server error during email verification' });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Generate JWT
        const payload = {
            user: {
                id: user.id,
                role: user.role
            }
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET || 'secretkeyfallback', // Fallback for dev only
            { expiresIn: '7d' },
            (err, token) => {
                if (err) throw err;
                res.json({
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role
                    }
                });
            }
        );
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // Set expiry to 15 mins from now
        const otpExpiry = new Date(Date.now() + 15 * 60000);

        await prisma.user.update({
            where: { email },
            data: { resetOTP: otp, resetOTPExpiry: otpExpiry }
        });

        const emailService = require('../utils/emailService');
        await emailService.sendOTPEmail(email, otp);

        res.json({ message: 'OTP sent successfully to ' + email });
    } catch (err) {
        console.error('Forgot Password Error:', err);
        res.status(500).json({ message: 'Error processing forgot password' });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.resetOTP !== otp || !user.resetOTPExpiry || new Date() > user.resetOTPExpiry) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password and clear OTP fields
        await prisma.user.update({
            where: { email },
            data: {
                password: hashedPassword,
                resetOTP: null,
                resetOTPExpiry: null
            }
        });

        res.json({ message: 'Password reset completely successful' });
    } catch (err) {
        console.error('Reset Password Error:', err);
        res.status(500).json({ message: 'Error resetting password' });
    }
};

const getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, email: true, role: true, profileImage: true, phone: true, address: true, createdAt: true }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (err) {
        console.error('Get Profile Error:', err);
        res.status(500).json({ message: 'Server error while fetching profile' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { name, email, password, phone, address } = req.body;

        let updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (address !== undefined) updateData.address = address;

        // Hash new password if provided
        if (password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        // If an image was uploaded, stream it to Cloudinary
        if (req.file) {
            const cloudinary = require('../utils/cloudinary');
            const streamifier = require('streamifier');

            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'glow_mystery_profiles' },
                async (error, result) => {
                    if (error) {
                        console.error('Cloudinary Error:', error);
                        return res.status(500).json({ message: 'Error uploading image' });
                    }

                    updateData.profileImage = result.secure_url;

                    // Update user in database after image is uploaded
                    const updatedUser = await prisma.user.update({
                        where: { id: req.user.id },
                        data: updateData,
                        select: { id: true, name: true, email: true, role: true, profileImage: true, phone: true, address: true }
                    });

                    return res.json({ message: 'Profile updated successfully', user: updatedUser });
                }
            );

            streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
            return; // Exit early since we're responding inside the stream callback
        }

        // If no image, just update the text fields
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData,
            select: { id: true, name: true, email: true, role: true, profileImage: true, phone: true, address: true }
        });

        res.json({ message: 'Profile updated successfully', user: updatedUser });
    } catch (err) {
        console.error('Update Profile Error:', err);
        res.status(500).json({ message: 'Server error while updating profile' });
    }
};

module.exports = {
    register,
    verifyEmail,
    login,
    forgotPassword,
    resetPassword,
    getProfile,
    updateProfile
};
