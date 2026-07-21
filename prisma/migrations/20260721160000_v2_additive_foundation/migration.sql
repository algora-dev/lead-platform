-- CreateEnum
CREATE TYPE "DiscoveryScanStatus" AS ENUM ('PENDING', 'DISCOVERING', 'EVIDENCE_GATHERING', 'SCORING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('JOB_ADVERT', 'COMPANY_WEBSITE', 'APOLLO_DATA', 'TECH_STACK', 'CONTACT_INFO', 'NEWS_ARTICLE', 'FUNDING_EVENT', 'TENDER', 'REVIEW', 'SOCIAL_PROFILE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('LOCATION', 'EMPLOYEE_COUNT', 'TECHNOLOGY', 'JOB_ADVERT', 'OPERATIONAL_ACTIVITY', 'FUNDING_EVENT', 'CONTACT_ROLE', 'REPEATED_SIGNAL', 'INDUSTRY', 'REVENUE');

-- CreateTable
CREATE TABLE "ProductProfile" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ProductProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductProfileVersion" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profileId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "problemsSolved" TEXT[],
    "outcomes" TEXT[],
    "industries" TEXT[],
    "keywords" TEXT[],
    "technologies" TEXT[],
    "companySizeMin" INTEGER,
    "companySizeMax" INTEGER,
    "pricingLevel" TEXT,
    "exclusions" TEXT[],
    "notes" TEXT,
    "rawInput" JSONB NOT NULL,
    "aiModel" TEXT,
    "aiPromptVersion" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ProductProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfileVersion" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profileId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "industries" TEXT[],
    "locations" TEXT[],
    "employeeCountMin" INTEGER,
    "employeeCountMax" INTEGER,
    "revenueMin" INTEGER,
    "revenueMax" INTEGER,
    "technologies" TEXT[],
    "operationalCharacteristics" TEXT[],
    "buyingSignals" TEXT[],
    "hiringSignals" TEXT[],
    "decisionMakers" TEXT[],
    "exclusions" TEXT[],
    "notes" TEXT,
    "rawInput" JSONB NOT NULL,
    "aiModel" TEXT,
    "aiPromptVersion" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryStrategy" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,
    "productProfileVersionIds" INTEGER[],
    "customerProfileVersionIds" INTEGER[],
    "queries" JSONB NOT NULL,
    "keywords" TEXT[],
    "inclusionFilters" JSONB NOT NULL,
    "exclusionFilters" TEXT[],
    "evidencePriorities" TEXT[],
    "enrichmentPriorities" TEXT[],
    "country" TEXT NOT NULL,
    "stateProvince" TEXT,
    "county" TEXT,
    "city" TEXT,
    "radiusKm" INTEGER,
    "scoringPolicyVersion" TEXT NOT NULL,
    "scoringConfig" JSONB NOT NULL,
    "aiModel" TEXT,
    "aiPromptVersion" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "DiscoveryStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanLibrary" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ScanLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryScan" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "libraryId" INTEGER,
    "strategyId" INTEGER NOT NULL,
    "parentScanId" INTEGER,
    "name" TEXT NOT NULL,
    "status" "DiscoveryScanStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "discoverNewOnly" BOOLEAN NOT NULL DEFAULT false,
    "recheckEvidence" BOOLEAN NOT NULL DEFAULT false,
    "rerunAll" BOOLEAN NOT NULL DEFAULT false,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "newCompanies" INTEGER NOT NULL DEFAULT 0,
    "updatedCompanies" INTEGER NOT NULL DEFAULT 0,
    "totalCostUnits" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "DiscoveryScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanCandidate" (
    "id" SERIAL NOT NULL,
    "scanId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "discoveryProvider" TEXT NOT NULL,
    "discoveryQuery" TEXT,
    "discoveryUrl" TEXT,
    "profileScore" INTEGER NOT NULL DEFAULT 0,
    "profileScoreBreakdown" JSONB,
    "evidenceGathered" BOOLEAN NOT NULL DEFAULT false,
    "assessmentDone" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ScanCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAlias" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "alias" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProviderIdentity" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProviderIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" INTEGER NOT NULL,
    "scanId" INTEGER,
    "providerRunId" INTEGER,
    "evidenceType" "EvidenceType" NOT NULL,
    "sourceUrl" TEXT,
    "sourceDomain" TEXT,
    "rawPayload" JSONB,
    "contentHash" TEXT,
    "normalisedPayload" JSONB,
    "reliability" INTEGER NOT NULL DEFAULT 50,
    "freshnessDays" INTEGER,
    "observedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceClaim" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceItemId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "claimValue" TEXT NOT NULL,
    "claimData" JSONB,
    "supports" BOOLEAN NOT NULL DEFAULT true,
    "contradictions" TEXT[],

    CONSTRAINT "EvidenceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRun" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerVersion" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "costUnits" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "ProviderRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSnapshot" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "strategyId" INTEGER NOT NULL,
    "profileScore" INTEGER NOT NULL DEFAULT 0,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "combinedScore" INTEGER NOT NULL DEFAULT 0,
    "profileBreakdown" JSONB,
    "confidenceBreakdown" JSONB,
    "scoringPolicyVersion" TEXT NOT NULL,
    "combinedPolicyVersion" TEXT NOT NULL,
    "aiSummary" TEXT,
    "outreachRationale" TEXT,
    "unknowns" TEXT[],
    "contradictions" TEXT[],
    "evidenceItemIds" INTEGER[],
    "priorSnapshotId" INTEGER,
    "scoreChange" INTEGER,

    CONSTRAINT "AssessmentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductProfile_tenantId_name_key" ON "ProductProfile"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductProfileVersion_profileId_versionNumber_key" ON "ProductProfileVersion"("profileId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_tenantId_name_key" ON "CustomerProfile"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfileVersion_profileId_versionNumber_key" ON "CustomerProfileVersion"("profileId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ScanLibrary_tenantId_name_key" ON "ScanLibrary"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ScanCandidate_scanId_companyId_key" ON "ScanCandidate"("scanId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAlias_companyId_alias_key" ON "CompanyAlias"("companyId", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProviderIdentity_provider_providerId_key" ON "CompanyProviderIdentity"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceItem_companyId_evidenceType_sourceUrl_key" ON "EvidenceItem"("companyId", "evidenceType", "sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceClaim_evidenceItemId_claimType_claimValue_key" ON "EvidenceClaim"("evidenceItemId", "claimType", "claimValue");

-- AddForeignKey
ALTER TABLE "ProductProfile" ADD CONSTRAINT "ProductProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProfileVersion" ADD CONSTRAINT "ProductProfileVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ProductProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfileVersion" ADD CONSTRAINT "CustomerProfileVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryStrategy" ADD CONSTRAINT "DiscoveryStrategy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLibrary" ADD CONSTRAINT "ScanLibrary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryScan" ADD CONSTRAINT "DiscoveryScan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryScan" ADD CONSTRAINT "DiscoveryScan_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "ScanLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryScan" ADD CONSTRAINT "DiscoveryScan_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "DiscoveryStrategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanCandidate" ADD CONSTRAINT "ScanCandidate_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "DiscoveryScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanCandidate" ADD CONSTRAINT "ScanCandidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAlias" ADD CONSTRAINT "CompanyAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProviderIdentity" ADD CONSTRAINT "CompanyProviderIdentity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceClaim" ADD CONSTRAINT "EvidenceClaim_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceClaim" ADD CONSTRAINT "EvidenceClaim_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderRun" ADD CONSTRAINT "ProviderRun_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "DiscoveryScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSnapshot" ADD CONSTRAINT "AssessmentSnapshot_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "DiscoveryScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSnapshot" ADD CONSTRAINT "AssessmentSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

