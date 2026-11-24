async function loadUsers(prisma) {
  const users = await prisma.user.findMany({
    include: { orders: true },
  });
  return users;
}