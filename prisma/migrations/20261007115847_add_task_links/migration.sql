-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in-progress',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "activityTypeId" TEXT,
    "jobId" TEXT,
    "contactId" TEXT,
    "createdVia" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("activityTypeId", "createdAt", "description", "dueDate", "id", "percentComplete", "priority", "status", "title", "updatedAt", "userId") SELECT "activityTypeId", "createdAt", "description", "dueDate", "id", "percentComplete", "priority", "status", "title", "updatedAt", "userId" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_userId_jobId_idx" ON "Task"("userId", "jobId");
CREATE INDEX "Task_userId_contactId_idx" ON "Task"("userId", "contactId");
CREATE INDEX "Task_userId_idx" ON "Task"("userId");
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");
CREATE INDEX "Task_userId_activityTypeId_idx" ON "Task"("userId", "activityTypeId");
CREATE INDEX "Task_userId_dueDate_idx" ON "Task"("userId", "dueDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
