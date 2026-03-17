require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const orders = await prisma.order.findMany({
        orderBy: { id: 'desc' },
        take: 3
    });
    console.log(JSON.stringify(orders.map(o => ({ id: o.id, status: o.status, shippingName: o.shippingName, shippingStreet: o.shippingStreet, shippingCity: o.shippingCity })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
