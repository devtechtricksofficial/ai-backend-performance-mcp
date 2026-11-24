async function loadUsersWithOrders(prisma) {
  const users = await prisma.user.findMany();
  for (const user of users) {
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
    });
    console.log(orders);
  }
}