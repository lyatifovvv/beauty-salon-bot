-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "description" TEXT,
    "masterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioItem_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Master" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
