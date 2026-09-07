import { prisma } from '../src/lib/db/prisma';

async function main() {
  console.log('--- DB INSPECTION START ---');
  try {
    const userCount = await prisma.user.count();
    console.log('CONNECTED TO DATABASE!');
    console.log('Total Users:', userCount);

    const users = await prisma.user.findMany({
      select: { id: true, email: true, isActive: true },
    });
    console.log('Users in DB:', JSON.stringify(users, null, 2));

    const empCount = await prisma.employee.count();
    console.log('Total Employees:', empCount);

    const employees = await prisma.employee.findMany({
      select: { id: true, employeeCode: true, firstName: true, lastName: true, organizationId: true },
    });
    console.log('Employees sample:', JSON.stringify(employees.slice(0, 5), null, 2));

    const deptCount = await prisma.department.count();
    const posCount = await prisma.position.count();
    const attCount = await prisma.attendance.count();
    const payCount = await prisma.payroll.count();
    const orgCount = await prisma.organization.count();
    const branchCount = await prisma.branch.count();

    console.log({
      orgCount,
      branchCount,
      userCount,
      empCount,
      deptCount,
      posCount,
      attCount,
      payCount,
    });
  } catch (err: any) {
    console.error('DATABASE ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
  console.log('--- DB INSPECTION END ---');
}

main();
