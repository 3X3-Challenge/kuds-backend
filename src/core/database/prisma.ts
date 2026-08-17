import { PrismaClient } from "@prisma/client";
import { databaseConfig } from "../../config/database";

export const prisma = new PrismaClient({ datasourceUrl: databaseConfig.url });
