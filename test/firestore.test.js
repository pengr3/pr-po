import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, updateDoc, addDoc } from "firebase/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let testEnv;

// =============================================
// Test Setup
// =============================================

before(async () => {
  const rulesPath = path.join(__dirname, "..", "firestore.rules");
  testEnv = await initializeTestEnvironment({
    projectId: "demo-clmc-procurement-test",
    firestore: {
      rules: fs.readFileSync(rulesPath, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

// =============================================
// Helper: Seed Test Users
// =============================================

async function seedUsers() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // Super Admin
    await setDoc(doc(db, "users", "active-super-admin"), {
      email: "superadmin@clmc.com",
      status: "active",
      role: "super_admin",
      display_name: "Super Admin",
    });

    // Operations Admin
    await setDoc(doc(db, "users", "active-ops-admin"), {
      email: "opsadmin@clmc.com",
      status: "active",
      role: "operations_admin",
      display_name: "Operations Admin",
    });

    // Operations User (with project assignment)
    await setDoc(doc(db, "users", "active-ops-user"), {
      email: "opsuser@clmc.com",
      status: "active",
      role: "operations_user",
      display_name: "Operations User",
      assigned_project_codes: ["CLMC_TEST_2026001"],
      all_projects: false,
    });

    // Finance
    await setDoc(doc(db, "users", "active-finance"), {
      email: "finance@clmc.com",
      status: "active",
      role: "finance",
      display_name: "Finance User",
    });

    // Procurement
    await setDoc(doc(db, "users", "active-procurement"), {
      email: "procurement@clmc.com",
      status: "active",
      role: "procurement",
      display_name: "Procurement User",
    });

    // Pending User
    await setDoc(doc(db, "users", "pending-user"), {
      email: "pending@clmc.com",
      status: "pending",
      role: null,
      display_name: "Pending User",
    });

    // Test role template
    await setDoc(doc(db, "role_templates", "operations_user"), {
      permissions: {
        home: { view: true, edit: false },
        procurement: { view: true, edit: true },
      },
    });

    // Test invitation code
    await setDoc(doc(db, "invitation_codes", "TEST-CODE-001"), {
      code: "TEST-CODE-001",
      created_by: "active-super-admin",
      used: false,
    });

    // Test MRF with project code
    await setDoc(doc(db, "mrfs", "MRF-2026-001"), {
      mrf_id: "MRF-2026-001",
      project_code: "CLMC_TEST_2026001",
      project_name: "Test Project",
      status: "Pending",
      items_json: JSON.stringify([{ item_name: "Test Item", qty: 1 }]),
    });

    // Legacy MRF (no project_code)
    await setDoc(doc(db, "mrfs", "MRF-2026-002"), {
      mrf_id: "MRF-2026-002",
      project_name: "Legacy Project",
      status: "Pending",
      items_json: JSON.stringify([{ item_name: "Legacy Item", qty: 1 }]),
    });
  });
}

// =============================================
// Test Suite: Unauthenticated Access
// =============================================

describe("Unauthenticated access", () => {
  beforeEach(seedUsers);

  it("denies read on users collection", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthedDb, "users", "active-super-admin")));
  });

  it("denies read on mrfs collection", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthedDb, "mrfs", "MRF-2026-001")));
  });
});

// =============================================
// Test Suite: Pending User Restrictions
// =============================================

describe("Pending user restrictions", () => {
  beforeEach(seedUsers);

  it("allows pending user to read invitation_codes", async () => {
    const pendingDb = testEnv.authenticatedContext("pending-user").firestore();
    await assertSucceeds(getDoc(doc(pendingDb, "invitation_codes", "TEST-CODE-001")));
  });

  it("denies pending user from reading mrfs", async () => {
    const pendingDb = testEnv.authenticatedContext("pending-user").firestore();
    await assertFails(getDoc(doc(pendingDb, "mrfs", "MRF-2026-001")));
  });
});

// =============================================
// Test Suite: Users Collection
// =============================================

describe("users collection", () => {
  beforeEach(seedUsers);

  it("super_admin can read any user", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(getDoc(doc(superAdminDb, "users", "active-finance")));
    await assertSucceeds(getDoc(doc(superAdminDb, "users", "active-ops-user")));
  });

  it("operations_admin can read operations_user documents only", async () => {
    const opsAdminDb = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertSucceeds(getDoc(doc(opsAdminDb, "users", "active-ops-user")));
  });

  it("operations_admin CANNOT read super_admin/finance/procurement docs", async () => {
    const opsAdminDb = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertFails(getDoc(doc(opsAdminDb, "users", "active-super-admin")));
    await assertFails(getDoc(doc(opsAdminDb, "users", "active-finance")));
    await assertFails(getDoc(doc(opsAdminDb, "users", "active-procurement")));
  });

  it("user self-create must have status: pending", async () => {
    const newUserDb = testEnv.authenticatedContext("new-user-123").firestore();

    // Should succeed with status: pending
    await assertSucceeds(
      setDoc(doc(newUserDb, "users", "new-user-123"), {
        email: "newuser@clmc.com",
        status: "pending",
        role: null,
        display_name: "New User",
      })
    );

    // Clean up for next assertion
    await testEnv.clearFirestore();
    await seedUsers();

    // Should fail with status: active (self-promotion attack)
    const attackerDb = testEnv.authenticatedContext("attacker-456").firestore();
    await assertFails(
      setDoc(doc(attackerDb, "users", "attacker-456"), {
        email: "attacker@clmc.com",
        status: "active",
        role: "super_admin",
        display_name: "Attacker",
      })
    );
  });
});

// =============================================
// Test Suite: Role Templates Collection
// =============================================

describe("role_templates collection", () => {
  beforeEach(seedUsers);

  it("active user can read role templates", async () => {
    const opsUserDb = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertSucceeds(getDoc(doc(opsUserDb, "role_templates", "operations_user")));
  });

  it("only super_admin can write role templates", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(
      setDoc(doc(superAdminDb, "role_templates", "new_role"), {
        permissions: { home: { view: true, edit: false } },
      })
    );

    const opsAdminDb = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertFails(
      setDoc(doc(opsAdminDb, "role_templates", "another_role"), {
        permissions: { home: { view: true, edit: false } },
      })
    );
  });
});

// =============================================
// Test Suite: MRFs Collection - Role Access
// =============================================

describe("mrfs collection - role access", () => {
  beforeEach(seedUsers);

  it("super_admin can create MRF", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(
      setDoc(doc(superAdminDb, "mrfs", "MRF-2026-100"), {
        mrf_id: "MRF-2026-100",
        project_code: "CLMC_TEST_2026001",
        project_name: "Test Project",
        status: "Pending",
        items_json: JSON.stringify([{ item_name: "New Item", qty: 1 }]),
      })
    );
  });

  it("operations_user can create MRF", async () => {
    const opsUserDb = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertSucceeds(
      setDoc(doc(opsUserDb, "mrfs", "MRF-2026-101"), {
        mrf_id: "MRF-2026-101",
        project_code: "CLMC_TEST_2026001",
        project_name: "Test Project",
        status: "Pending",
        items_json: JSON.stringify([{ item_name: "User Item", qty: 1 }]),
      })
    );
  });

  it("finance CANNOT create MRF", async () => {
    const financeDb = testEnv.authenticatedContext("active-finance").firestore();
    await assertFails(
      setDoc(doc(financeDb, "mrfs", "MRF-2026-102"), {
        mrf_id: "MRF-2026-102",
        project_code: "CLMC_TEST_2026001",
        project_name: "Test Project",
        status: "Pending",
        items_json: JSON.stringify([{ item_name: "Finance Item", qty: 1 }]),
      })
    );
  });
});

// =============================================
// Test Suite: MRFs Collection - Project Scoping
// =============================================

describe("mrfs collection - project scoping", () => {
  beforeEach(seedUsers);

  it("operations_user can read MRF with assigned project_code", async () => {
    const opsUserDb = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertSucceeds(getDoc(doc(opsUserDb, "mrfs", "MRF-2026-001")));
  });

  it("legacy MRF (no project_code) is readable by operations_user", async () => {
    const opsUserDb = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertSucceeds(getDoc(doc(opsUserDb, "mrfs", "MRF-2026-002")));
  });
});

// =============================================
// Test Suite: Console Bypass Prevention
// =============================================

describe("console bypass prevention", () => {
  beforeEach(seedUsers);

  it("operations_user cannot update MRF (even though UI hides the button)", async () => {
    const opsUserDb = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertFails(
      updateDoc(doc(opsUserDb, "mrfs", "MRF-2026-001"), {
        status: "Approved",
      })
    );
  });

  it("finance cannot delete MRF", async () => {
    const financeDb = testEnv.authenticatedContext("active-finance").firestore();
    await assertFails(deleteDoc(doc(financeDb, "mrfs", "MRF-2026-001")));
  });
});
