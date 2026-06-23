import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_PASSWORD;

async function main() {
  if (!email || !password || password.length < 12) {
    throw new Error("OWNER_EMAIL and OWNER_PASSWORD with at least 12 characters are required");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      role: UserRole.OWNER
    },
    update: {
      passwordHash,
      role: UserRole.OWNER
    }
  });

  console.log(`Owner user ready: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
