import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import assert from "node:assert/strict";
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

    // Services Admin (all services access)
    await setDoc(doc(db, "users", "active-services-admin"), {
      email: "servicesadmin@clmc.com",
      status: "active",
      role: "services_admin",
      display_name: "Services Admin",
      all_services: true,
      assigned_service_codes: []
    });

    // Services User (assigned to SVC-001 only, NOT SVC-UNASSIGNED)
    await setDoc(doc(db, "users", "active-services-user"), {
      email: "servicesuser@clmc.com",
      status: "active",
      role: "services_user",
      display_name: "Services User",
      all_services: false,
      assigned_service_codes: ["SVC-001"]
    });

    // Test Service document (pre-seeded for read tests)
    await setDoc(doc(db, "services", "SVC-001"), {
      service_code: "SVC-001",
      service_name: "Test Service Alpha",
      status: "active"
    });

    // Unassigned service document (for list-scoping test — active-services-user is NOT assigned to this)
    await setDoc(doc(db, "services", "SVC-UNASSIGNED"), {
      service_code: "SVC-UNASSIGNED",
      service_name: "Unassigned Service",
      status: "active"
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

// =============================================
// Test Suite: Operations Admin Project Assignments
// =============================================

describe("operations_admin project assignments", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Super Admin (no assignments needed - sees all)
      await setDoc(doc(db, "users", "active-super-admin"), {
        email: "superadmin@clmc.com",
        status: "active",
        role: "super_admin",
        display_name: "Super Admin",
      });

      // Operations Admin WITH assignments
      await setDoc(doc(db, "users", "ops-admin-assigned"), {
        email: "opsadmin@clmc.com",
        status: "active",
        role: "operations_admin",
        display_name: "Ops Admin Assigned",
        assigned_project_codes: ["CLMC_TEST_2026001"],
        all_projects: false,
      });

      // Operations Admin with all_projects flag
      await setDoc(doc(db, "users", "ops-admin-all"), {
        email: "opsadmin2@clmc.com",
        status: "active",
        role: "operations_admin",
        display_name: "Ops Admin All Projects",
        all_projects: true,
        assigned_project_codes: [],
      });

      // Test projects
      await setDoc(doc(db, "projects", "assigned-project"), {
        project_code: "CLMC_TEST_2026001",
        project_name: "Assigned Project",
        is_active: true,
      });

      await setDoc(doc(db, "projects", "other-project"), {
        project_code: "CLMC_OTHER_2026001",
        project_name: "Other Project",
        is_active: true,
      });
    });
  });

  it("operations_admin with assigned_project_codes can read assigned project", async () => {
    const opsAdminDb = testEnv.authenticatedContext("ops-admin-assigned").firestore();
    await assertSucceeds(getDoc(doc(opsAdminDb, "projects", "assigned-project")));
  });

  it("operations_admin with all_projects true can read any project", async () => {
    const opsAdminDb = testEnv.authenticatedContext("ops-admin-all").firestore();
    await assertSucceeds(getDoc(doc(opsAdminDb, "projects", "other-project")));
  });

  it("super_admin can update user assignments", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(
      updateDoc(doc(superAdminDb, "users", "ops-admin-assigned"), {
        assigned_project_codes: ["CLMC_TEST_2026001", "CLMC_OTHER_2026001"],
      })
    );
  });
});

// =============================================
// Test Suite: Clients Collection - Super Admin Access
// =============================================

describe("clients collection - super admin access", () => {
  beforeEach(async () => {
    await seedUsers();

    // Seed test client
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "test-client"), {
        client_code: "TEST",
        company_name: "Test Company",
        contact_person: "John Doe",
        contact_details: "john@test.com",
        created_at: new Date().toISOString(),
      });
    });
  });

  it("super_admin can read clients", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(getDoc(doc(superAdminDb, "clients", "test-client")));
  });

  it("super_admin can list clients", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(getDocs(collection(superAdminDb, "clients")));
  });

  it("super_admin can create client", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(
      setDoc(doc(superAdminDb, "clients", "new-client"), {
        client_code: "NEW",
        company_name: "New Company",
        contact_person: "Jane Doe",
        contact_details: "jane@new.com",
        created_at: new Date().toISOString(),
      })
    );
  });

  it("super_admin can update client", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(
      updateDoc(doc(superAdminDb, "clients", "test-client"), {
        contact_person: "Updated Name",
      })
    );
  });

  it("super_admin can delete client", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(deleteDoc(doc(superAdminDb, "clients", "test-client")));
  });

  it("operations_admin can read clients", async () => {
    const opsAdminDb = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertSucceeds(getDoc(doc(opsAdminDb, "clients", "test-client")));
  });

  it("operations_admin can create client", async () => {
    const opsAdminDb = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertSucceeds(
      setDoc(doc(opsAdminDb, "clients", "ops-admin-client"), {
        client_code: "OPS",
        company_name: "Ops Admin Client",
        contact_person: "Ops Person",
        contact_details: "ops@test.com",
        created_at: new Date().toISOString(),
      })
    );
  });

  it("finance CANNOT create client", async () => {
    const financeDb = testEnv.authenticatedContext("active-finance").firestore();
    await assertFails(
      setDoc(doc(financeDb, "clients", "finance-client"), {
        client_code: "FIN",
        company_name: "Finance Client",
        contact_person: "Finance Person",
        contact_details: "finance@test.com",
        created_at: new Date().toISOString(),
      })
    );
  });
});

// =============================================
// Test Suite: Services Collection - Role Access
// =============================================

describe("services collection - role access", () => {
  beforeEach(seedUsers);

  it("super_admin can read services collection", async () => {
    const db = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(getDoc(doc(db, "services", "SVC-001")));
  });

  it("services_admin can read services collection", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(getDoc(doc(db, "services", "SVC-001")));
  });

  it("services_admin can create a service", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(
      setDoc(doc(db, "services", "SVC-ADMIN-NEW"), {
        service_code: "SVC-ADMIN-NEW",
        service_name: "Admin Created Service",
        status: "active"
      })
    );
  });

  it("services_admin can update a service", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "services", "SVC-001"), {
        service_name: "Updated Service Name"
      })
    );
  });

  it("services_admin can delete a service", async () => {
    // Seed a deletable doc first (rules disabled context)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "services", "SVC-DELETE-TEST"), {
        service_code: "SVC-DELETE-TEST",
        service_name: "To Be Deleted"
      });
    });
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(deleteDoc(doc(db, "services", "SVC-DELETE-TEST")));
  });

  it("services_user can read an assigned service", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertSucceeds(getDoc(doc(db, "services", "SVC-001")));
  });

  it("services_user CANNOT create a service (read-only)", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertFails(
      setDoc(doc(db, "services", "SVC-USER-WRITE"), {
        service_code: "SVC-USER-WRITE",
        service_name: "Unauthorized Write"
      })
    );
  });

  it("finance can read services collection (cross-department)", async () => {
    const db = testEnv.authenticatedContext("active-finance").firestore();
    await assertSucceeds(getDoc(doc(db, "services", "SVC-001")));
  });

  it("finance CANNOT write to services collection", async () => {
    const db = testEnv.authenticatedContext("active-finance").firestore();
    await assertFails(
      setDoc(doc(db, "services", "SVC-FINANCE-WRITE"), {
        service_code: "SVC-FINANCE-WRITE",
        service_name: "Finance Write Attempt"
      })
    );
  });

  it("procurement can read services collection (cross-department)", async () => {
    const db = testEnv.authenticatedContext("active-procurement").firestore();
    await assertSucceeds(getDoc(doc(db, "services", "SVC-001")));
  });

  it("operations_user CANNOT read services collection (department silo)", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertFails(getDoc(doc(db, "services", "SVC-001")));
  });

  it("operations_admin CANNOT read services collection (department silo)", async () => {
    const db = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertFails(getDoc(doc(db, "services", "SVC-001")));
  });

  it("services_user CANNOT list an unassigned service via collection query (list scoping)", async () => {
    // DESIGN NOTE: allow get is intentionally broad for services_user (by doc ID lookup, mirrors mrfs pattern).
    // The allow list rule is where assignment scoping is enforced via isAssignedToService().
    // This test exercises the list rule path using a query, not getDoc.
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertFails(
      getDocs(query(collection(db, "services"), where("service_code", "==", "SVC-UNASSIGNED")))
    );
  });
});

// =============================================
// Test Suite: services_admin User Document Access
// =============================================

describe("services_admin user document access", () => {
  beforeEach(seedUsers);

  it("services_admin can get a services_user document", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(getDoc(doc(db, "users", "active-services-user")));
  });

  it("services_admin can list users collection", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(getDocs(query(collection(db, "users"), where("role", "==", "services_user"))));
  });

  it("services_admin can update assigned_service_codes on a services_user document", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "users", "active-services-user"), {
        assigned_service_codes: ["SVC-001", "SVC-002"]
      })
    );
  });

  it("services_admin CANNOT update an operations_admin document", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-ops-admin"), {
        assigned_service_codes: ["SVC-001"]
      })
    );
  });

  it("services_admin CANNOT update a finance user document", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-finance"), {
        assigned_service_codes: ["SVC-001"]
      })
    );
  });

  it("services_admin CANNOT update a super_admin document", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-super-admin"), {
        assigned_service_codes: ["SVC-001"]
      })
    );
  });
});

// =============================================
// Test Suite: Cross-Department Personnel Assignment Sync (D-17 — carve-out REMOVED)
// (services-user-project-hidden fix, 2026-08-10 — before this fix, syncPersonnelToAssignments /
// syncServicePersonnelToAssignments silently failed here with PERMISSION_DENIED, leaving the
// target user's assignment array unpopulated and the project/service invisible to them)
//
// Phase 113 D-17 (2026-08-11): the users.update carve-out these tests exercised was REMOVED.
// syncPersonnelToAssignments / syncServicePersonnelToAssignments no longer exist (plan 113-09)
// and the Assignments tab now writes personnel membership onto the CONTAINER document instead
// of the user document (plan 113-08) — no client path constructs a cross-department
// users.update write any more, so the carve-out grant became unreachable. These 3 suites (9
// tests total) are RETAINED with the 4 previously-`assertSucceeds` tests INVERTED to
// `assertFails`, using the same fixtures and payloads, so a future re-introduction of the
// carve-out fails this suite immediately. The other 5 tests already asserted denial and are
// unchanged.
// =============================================

describe("operations_admin cross-dept assignment sync", () => {
  beforeEach(seedUsers);

  it("operations_admin CANNOT update assigned_project_codes on a services_user document (D-17 carve-out removed)", async () => {
    const db = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-services-user"), {
        assigned_project_codes: ["CLMC_TEST_2026001"]
      })
    );
  });

  it("operations_admin CANNOT change other fields on a services_user document via the sync path", async () => {
    const db = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-services-user"), {
        assigned_project_codes: ["CLMC_TEST_2026001"],
        role: "operations_user"
      })
    );
  });

  it("operations_admin CANNOT update assigned_project_codes on a services_admin document", async () => {
    const db = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-services-admin"), {
        assigned_project_codes: ["CLMC_TEST_2026001"]
      })
    );
  });

  it("operations_admin CANNOT update assigned_project_codes on a finance user document", async () => {
    const db = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-finance"), {
        assigned_project_codes: ["CLMC_TEST_2026001"]
      })
    );
  });
});

describe("services_admin cross-dept assignment sync", () => {
  beforeEach(seedUsers);

  it("services_admin CANNOT update assigned_service_codes on an operations_user document (D-17 carve-out removed)", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-ops-user"), {
        assigned_service_codes: ["SVC-001"]
      })
    );
  });

  it("services_admin CANNOT change other fields on an operations_user document via the sync path", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-ops-user"), {
        assigned_service_codes: ["SVC-001"],
        role: "services_user"
      })
    );
  });
});

// Assignments tab (app/views/assignments.js saveManageModal) writes the codes field AND the
// legacy all_projects/all_services flag (set to false) in the SAME updateDoc call — a 2-key
// diff, not the 1-key diff the Personnel-panel sync path uses. Reproduces the gap probe.
describe("cross-dept Assignments-tab modal save (2-field write)", () => {
  beforeEach(seedUsers);

  it("operations_admin CANNOT update assigned_project_codes + all_projects together on a services_user document (D-17 carve-out removed)", async () => {
    const db = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-services-user"), {
        assigned_project_codes: ["CLMC_TEST_2026001"],
        all_projects: false
      })
    );
  });

  it("services_admin CANNOT update assigned_service_codes + all_services together on an operations_user document (D-17 carve-out removed)", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-ops-user"), {
        assigned_service_codes: ["SVC-001"],
        all_services: false
      })
    );
  });

  it("operations_admin CANNOT smuggle a third field alongside the codes+flag pair", async () => {
    const db = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-services-user"), {
        assigned_project_codes: ["CLMC_TEST_2026001"],
        all_projects: false,
        role: "operations_user"
      })
    );
  });
});

// =============================================
// Test Suite: Phase 113 — additive personnel predicate (transitional)
// (assignment-source-of-truth-and-project-read-enforcement, Plan 01) — originally proved the
// widened services/project_tasks/service_tasks branches accept the NEW personnel_user_ids
// predicate, still accept the LEGACY assigned_*_codes predicate, still honour the all_services
// escape hatch, and grant nothing to a non-member role.
//
// Phase 113 D-02/D-08 (plan 113-10): the LEGACY assigned_*_codes / isAssignedToService(...)
// alternative was retired from every branch this suite exercises. The one test below that
// asserted the legacy `service_code in` query SUCCEEDS is CONVERTED (not deleted) to assert it
// now FAILS — personnel_user_ids is the sole predicate from here on. Every other test in this
// suite already exercises the personnel_user_ids path and needs no change.
// =============================================

describe("Phase 113 — additive personnel predicate (transitional)", () => {
  beforeEach(seedUsers);

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Service assigned to active-services-user ONLY via personnel_user_ids (not the
      // legacy assigned_service_codes array, which only lists SVC-001 for this user).
      await setDoc(doc(db, "services", "SVC-PERSONNEL"), {
        service_code: "SVC-PERSONNEL",
        personnel_user_ids: ["active-services-user"],
        client_code: "TEST",
        active: true,
      });

      // Parent project assigned to active-services-user ONLY via personnel_user_ids.
      await setDoc(doc(db, "projects", "proj-personnel"), {
        project_code: "CLMC_TEST_2026999",
        personnel_user_ids: ["active-services-user"],
      });

      // project_tasks doc whose Tier-1 write authority is reachable ONLY through the
      // parent project's personnel_user_ids (project_code is NOT in active-services-user's
      // legacy assigned_project_codes — that field isn't even set on this fixture user).
      await setDoc(doc(db, "project_tasks", "TASK-P1"), {
        project_id: "proj-personnel",
        project_code: "CLMC_TEST_2026999",
        assignees: [],
        progress: 0,
      });

      // service_tasks doc whose Tier-1 write authority is reachable ONLY through the
      // parent service's personnel_user_ids.
      await setDoc(doc(db, "service_tasks", "TASK-S1"), {
        service_id: "SVC-PERSONNEL",
        service_code: "SVC-PERSONNEL",
        assignees: [],
        progress: 0,
      });
    });
  });

  it("active-services-user succeeds on the NEW personnel_user_ids array-contains list query", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertSucceeds(
      getDocs(query(collection(db, "services"), where("personnel_user_ids", "array-contains", "active-services-user")))
    );
  });

  it("active-services-user now FAILS on the LEGACY service_code 'in' list query (D-08 — legacy predicate retired in plan 113-10)", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertFails(
      getDocs(query(collection(db, "services"), where("service_code", "in", ["SVC-001"])))
    );
  });

  it("active-services-admin (all_services: true) succeeds on an unscoped services list (D-09 escape hatch)", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(getDocs(collection(db, "services")));
  });

  it("active-services-user updates a service reachable ONLY via personnel_user_ids (widened services update)", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "services", "SVC-PERSONNEL"), {
        project_status: "On-going",
        updated_at: "2026-08-10T00:00:00.000Z"
      })
    );
  });

  it("active-services-user Tier-1-edits a project_tasks doc via the parent project's personnel_user_ids", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "project_tasks", "TASK-P1"), {
        name: "renamed",
        updated_at: "2026-08-10T00:00:00.000Z"
      })
    );
  });

  it("active-services-user Tier-1-edits a service_tasks doc via the parent service's personnel_user_ids", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "service_tasks", "TASK-S1"), {
        name: "renamed",
        updated_at: "2026-08-10T00:00:00.000Z"
      })
    );
  });

  it("active-procurement (non-member role) CANNOT update project_tasks TASK-P1 (no leaked authority)", async () => {
    const db = testEnv.authenticatedContext("active-procurement").firestore();
    await assertFails(
      updateDoc(doc(db, "project_tasks", "TASK-P1"), {
        name: "x"
      })
    );
  });
});

// =============================================
// Test Suite: projects collection - read rule (D-15 get/list split, Option B)
// =============================================
// Net-new — no test in this file previously asserted `allow get` / `allow list` behaviour on
// `projects`. Option B (operator decision, 2026-08-11): the exempt role list is
// super_admin/finance/procurement/operations_admin ONLY — services_admin is SCOPED here (see
// firestore.rules:280-296), matching D-16 and the client-layer PROJECT_SEE_ALL_ROLES posture.
// Covers the exempt unscoped path (case 1), the denied unscoped path for a scoped role (case 2),
// the admitted scoped paths with a result-content assertion (cases 3-5), both direct-doc-ID
// outcomes (cases 6-7), the all_projects escape hatch (case 8), the retired code-generation
// range-scan shape (case 9), and the T-113-55 status-gate on the escape hatch (case 10).

describe("projects collection - read rule (D-15)", () => {
  beforeEach(seedUsers);

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      await setDoc(doc(db, "projects", "proj-assigned"), {
        project_code: "CLMC_TEST_2026001",
        client_code: "TEST",
        personnel_user_ids: ["active-ops-user"],
      });

      await setDoc(doc(db, "projects", "proj-unassigned"), {
        project_code: "CLMC_TEST_2026002",
        client_code: "TEST",
        personnel_user_ids: [],
      });

      // Case 8 fixture: a SCOPED role (operations_user, not in the exempt hasRole([...]) list)
      // carrying the all_projects escape hatch. Distinct from active-ops-user so this test can't
      // be confused with the exempt-role path in case 1 — it isolates the hoisted all_projects
      // OR term specifically.
      await setDoc(doc(db, "users", "all-projects-ops-user"), {
        email: "allprojects@clmc.com",
        status: "active",
        role: "operations_user",
        display_name: "All-Projects Ops User",
        all_projects: true,
        assigned_project_codes: [],
      });

      // Case 10 fixture — T-113-55 status-gate guard. status: pending + role: null makes both
      // the hasRole([...]) exempt term AND the isRole(...)-gated personnel term unsatisfiable,
      // isolating the hoisted all_projects term. The stock pending-user fixture (seedUsers)
      // carries no all_projects field, so it cannot exercise this path — a dedicated fixture is
      // required.
      await setDoc(doc(db, "users", "pending-user-all-projects"), {
        email: "pendingall@clmc.com",
        status: "pending",
        role: null,
        all_projects: true,
        assigned_project_codes: [],
      });
    });
  });

  // Case 1
  it("exempt roles (super_admin/finance/procurement/operations_admin) succeed on an unscoped projects list", async () => {
    for (const uid of ["active-super-admin", "active-finance", "active-procurement", "active-ops-admin"]) {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertSucceeds(getDocs(collection(db, "projects")));
    }
  });

  // Case 2
  it("active-ops-user FAILS on the unscoped projects list (the query shape this phase eliminates)", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertFails(getDocs(collection(db, "projects")));
  });

  // Case 3 — asserts on returned document IDs, not just promise resolution
  it("active-ops-user SUCCEEDS on the bare personnel_user_ids array-contains query, scoped to exactly their assignment", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    const snap = await assertSucceeds(
      getDocs(query(collection(db, "projects"), where("personnel_user_ids", "array-contains", "active-ops-user")))
    );
    assert.deepStrictEqual(snap.docs.map(d => d.id), ["proj-assigned"]);
  });

  // Case 4
  it("active-ops-user SUCCEEDS on the paired project_code + array-contains query (project-detail.js / project-plan.js shape)", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "projects"),
        where("project_code", "==", "CLMC_TEST_2026001"),
        where("personnel_user_ids", "array-contains", "active-ops-user")
      ))
    );
  });

  // Case 5
  it("active-ops-user SUCCEEDS on the paired client_code + array-contains query (clients.js shape)", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertSucceeds(
      getDocs(query(
        collection(db, "projects"),
        where("client_code", "==", "TEST"),
        where("personnel_user_ids", "array-contains", "active-ops-user")
      ))
    );
  });

  // Case 6
  it("active-ops-user SUCCEEDS on getDoc for an assigned project (D-15 scoped get)", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertSucceeds(getDoc(doc(db, "projects", "proj-assigned")));
  });

  // Case 7 — the direct-doc-ID link closure D-15 asks for
  it("active-ops-user FAILS on getDoc for an unassigned project (direct doc-ID link closure)", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertFails(getDoc(doc(db, "projects", "proj-unassigned")));
  });

  // Case 8
  it("a fixture carrying all_projects: true SUCCEEDS on the unscoped list (D-09 escape hatch)", async () => {
    const db = testEnv.authenticatedContext("all-projects-ops-user").firestore();
    await assertSucceeds(getDocs(collection(db, "projects")));
  });

  // Case 9 — Option B: services_admin is SCOPED, not exempt. Code generation no longer issues
  // this query at all: commit cf0fa92 replaced the projects/services range scan with an atomic
  // code_counters/{clientCode}_{year} document (_nextClmcCode() in app/utils.js). This test pins
  // that the OLD range-scan shape stays denied for services_admin so a future edit cannot
  // silently re-introduce a dependency on it.
  it("services_admin FAILS on generateServiceCode's old range-scan shape against projects (Option B scopes services_admin; code generation no longer issues this query — commit cf0fa92)", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    const rangeMin = "CLMC-TEST-2026000";
    const rangeMax = "CLMC-TEST-2026999";
    await assertFails(
      getDocs(query(
        collection(db, "projects"),
        where("client_code", "==", "TEST"),
        where("project_code", ">=", rangeMin),
        where("project_code", "<=", rangeMax)
      ))
    );
  });

  // Case 10 — T-113-55 falsification-checked guard. See 113-10-SUMMARY.md for the observed
  // before/after of temporarily removing the isActiveUser() gate from `allow get`.
  it("a pending account with a stale all_projects: true flag is DENIED on both getDoc and the unscoped list (T-113-55 status-gate)", async () => {
    const db = testEnv.authenticatedContext("pending-user-all-projects").firestore();
    await assertFails(getDoc(doc(db, "projects", "proj-assigned")));
    await assertFails(getDocs(collection(db, "projects")));
  });
});

// =============================================
// Test Suite: services collection - tightening regression (D-08)
// =============================================
// Confirms the plan-113-10 removal of the legacy isAssignedToService(...) alternative from
// `services` allow list: the OLD service_code-based query is now denied; the personnel_user_ids
// array-contains query (the sole surviving predicate) still succeeds and returns exactly the
// assigned document.

describe("services collection - tightening regression (D-08)", () => {
  beforeEach(seedUsers);

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "services", "SVC-TIGHTEN"), {
        service_code: "SVC-TIGHTEN",
        service_name: "Tightening Regression Fixture",
        personnel_user_ids: ["active-services-user"],
      });
    });
  });

  it("active-services-user FAILS on the legacy service_code 'in' list query (isAssignedToService retired)", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertFails(
      getDocs(query(collection(db, "services"), where("service_code", "in", ["SVC-001"])))
    );
  });

  it("active-services-user SUCCEEDS on the personnel_user_ids array-contains list query", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    const snap = await assertSucceeds(
      getDocs(query(collection(db, "services"), where("personnel_user_ids", "array-contains", "active-services-user")))
    );
    assert.deepStrictEqual(snap.docs.map(d => d.id), ["SVC-TIGHTEN"]);
  });
});

// =============================================
// Test Suite: code_counters collection (Phase 113 D-16 — CODE-01 successor)
// =============================================
// Not in the original plan text — the collection did not exist when 113-10-PLAN.md was written.
// Added per the 113-10 Task-3 deviation. Authorization mirrors project/service create authority
// (super_admin, operations_admin, services_admin); writes must carry an integer last_seq, and
// the update path is monotonic-only (last_seq may only increase) — the structural guard against
// a stale client or a replayed transaction re-issuing an already-used CLMC code.

describe("code_counters collection (Phase 113 D-16)", () => {
  beforeEach(seedUsers);

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "code_counters", "TEST_2026"), {
        last_seq: 5,
      });
    });
  });

  it("active-services-admin can create a counter with an integer last_seq >= 0", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(
      setDoc(doc(db, "code_counters", "NEWCLIENT_2026"), { last_seq: 0 })
    );
  });

  it("active-services-admin can update a counter to a HIGHER last_seq", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "code_counters", "TEST_2026"), { last_seq: 6 })
    );
  });

  it("active-services-admin CANNOT update a counter to a LOWER last_seq (monotonic guard)", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "code_counters", "TEST_2026"), { last_seq: 4 })
    );
  });

  it("active-services-admin CANNOT update a counter to an EQUAL last_seq (monotonic guard)", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "code_counters", "TEST_2026"), { last_seq: 5 })
    );
  });

  it("active-ops-user CANNOT create a counter (not a project/service creator)", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertFails(
      setDoc(doc(db, "code_counters", "OPSUSER_2026"), { last_seq: 0 })
    );
  });

  it("active-ops-user CANNOT update a counter (not a project/service creator)", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertFails(
      updateDoc(doc(db, "code_counters", "TEST_2026"), { last_seq: 6 })
    );
  });

  it("nobody can DELETE a counter, including super_admin", async () => {
    const db = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertFails(deleteDoc(doc(db, "code_counters", "TEST_2026")));
  });

  it("a create with a non-integer last_seq (string) is rejected", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      setDoc(doc(db, "code_counters", "BADTYPE_2026"), { last_seq: "5" })
    );
  });
});
