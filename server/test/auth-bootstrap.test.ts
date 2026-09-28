import { startServer } from '../index'
import { Server } from 'http'
import { resetDbForTests, getAllUsers, getAdminCount } from '../db'
import { resetBootstrapRateLimit } from '../auth'

function createMockJwt(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = Buffer.from('mock_signature').toString('base64url')
  return `${header}.${body}.${signature}`
}

async function runAuthBootstrapTests() {
  console.log('=== Starting OIDC & Administrator Bootstrap Flow Tests ===')
  process.env.NODE_ENV = 'test'
  process.env.JUNIE_TEST = 'true'
  const TEST_BOOTSTRAP_SECRET = 'secret_bootstrap_xyz_987654321_alpha_beta_gamma'
  process.env.BOOTSTRAP_ADMIN_SECRET = TEST_BOOTSTRAP_SECRET

  const server = (await startServer(3457)) as Server
  const baseUrl = 'http://localhost:3457/api'

  try {
    // -------------------------------------------------------------
    // Test 1: Fresh DB + check bootstrap status
    // -------------------------------------------------------------
    console.log('Test 1: Fresh DB requires bootstrap...')
    await resetDbForTests()
    resetBootstrapRateLimit()

    const statusRes = await fetch(`${baseUrl}/auth/bootstrap-status`)
    if (statusRes.status !== 200) throw new Error(`Status check failed: ${statusRes.status}`)
    const statusData = await statusRes.json()
    if (statusData.bootstrapRequired !== true) throw new Error('Expected bootstrapRequired to be true')
    if (statusData.adminCount !== 0) throw new Error('Expected adminCount to be 0')
    console.log('✓ Test 1 passed: Fresh DB correctly reports bootstrap required.')

    // -------------------------------------------------------------
    // Test 2: Fresh DB + valid OIDC login (no bootstrap secret) -> no local user created
    // -------------------------------------------------------------
    console.log('Test 2: Valid OIDC login on fresh DB without bootstrap secret...')
    const oidcUser1Token = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'user_alice_123',
      name: 'Alice Admin Candidate',
      email: 'alice@example.com',
    })

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oidcUser1Token}`,
      },
    })
    if (loginRes.status !== 200) throw new Error(`Login endpoint failed: ${loginRes.status}`)
    const loginData = await loginRes.json()
    if (loginData.bootstrapRequired !== true) throw new Error('Expected bootstrapRequired: true')
    if (loginData.user !== null) throw new Error('Expected user to be null before bootstrap')

    const usersAfterLogin = await getAllUsers()
    if (usersAfterLogin.length !== 0) {
      throw new Error(`Expected 0 users in database before bootstrap, but found ${usersAfterLogin.length}`)
    }
    console.log('✓ Test 2 passed: Valid OIDC login on fresh DB requires bootstrap and does not create local user.')

    // -------------------------------------------------------------
    // Test 3: Fresh DB + wrong bootstrap secret -> no local user created
    // -------------------------------------------------------------
    console.log('Test 3: Bootstrap with wrong secret...')
    const wrongSecretRes = await fetch(`${baseUrl}/auth/bootstrap-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oidcUser1Token}`,
      },
      body: JSON.stringify({ bootstrapSecret: 'completely_wrong_secret' }),
    })
    if (wrongSecretRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized on wrong secret, got ${wrongSecretRes.status}`)
    }
    const usersAfterWrongSecret = await getAllUsers()
    if (usersAfterWrongSecret.length !== 0) {
      throw new Error('Database was modified after wrong bootstrap secret!')
    }
    console.log('✓ Test 3 passed: Wrong bootstrap secret rejected with 401 and database unchanged.')

    // -------------------------------------------------------------
    // Test 4: Fresh DB + correct bootstrap secret -> local admin created
    // -------------------------------------------------------------
    console.log('Test 4: Bootstrap with correct secret...')
    const correctSecretRes = await fetch(`${baseUrl}/auth/bootstrap-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oidcUser1Token}`,
      },
      body: JSON.stringify({ bootstrapSecret: TEST_BOOTSTRAP_SECRET }),
    })
    if (correctSecretRes.status !== 201) {
      const errText = await correctSecretRes.text()
      throw new Error(`Bootstrap failed with status ${correctSecretRes.status}: ${errText}`)
    }
    const bootstrapData = await correctSecretRes.json()
    if (!bootstrapData.user || !bootstrapData.user.is_admin) {
      throw new Error('Expected created user to be an administrator')
    }
    if (bootstrapData.user.oidc_issuer !== 'https://auth.example.com') {
      throw new Error('OIDC issuer mismatch on created admin')
    }
    if (bootstrapData.user.oidc_subject !== 'user_alice_123') {
      throw new Error('OIDC subject mismatch on created admin')
    }

    const adminCount = await getAdminCount()
    if (adminCount !== 1) throw new Error(`Expected adminCount: 1, got ${adminCount}`)
    console.log('✓ Test 4 passed: First administrator created successfully with OIDC mapping.')

    // -------------------------------------------------------------
    // Test 5: Check status after bootstrap
    // -------------------------------------------------------------
    console.log('Test 5: Check bootstrap status after initial admin created...')
    const postBootstrapStatus = await (await fetch(`${baseUrl}/auth/bootstrap-status`)).json()
    if (postBootstrapStatus.bootstrapRequired !== false) {
      throw new Error('Expected bootstrapRequired to be false after bootstrap')
    }
    console.log('✓ Test 5 passed: Bootstrap mode disabled automatically.')

    // -------------------------------------------------------------
    // Test 6: Attempting bootstrap again with another user -> rejected
    // -------------------------------------------------------------
    console.log('Test 6: Second user attempts bootstrap after initial admin exists...')
    const oidcUser2Token = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'user_bob_456',
      name: 'Bob Malicious or Late',
      email: 'bob@example.com',
    })

    const secondBootstrapRes = await fetch(`${baseUrl}/auth/bootstrap-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oidcUser2Token}`,
      },
      body: JSON.stringify({ bootstrapSecret: TEST_BOOTSTRAP_SECRET }),
    })
    if (secondBootstrapRes.status !== 409 && secondBootstrapRes.status !== 400) {
      throw new Error(`Expected 409 Conflict for second bootstrap attempt, got ${secondBootstrapRes.status}`)
    }
    console.log('✓ Test 6 passed: Bootstrap secret rejected after first admin established.')

    // -------------------------------------------------------------
    // Test 7: Normal OIDC login after bootstrap established -> standard user created
    // -------------------------------------------------------------
    console.log('Test 7: Normal OIDC login for standard user...')
    const bobLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oidcUser2Token}`,
      },
    })
    if (bobLoginRes.status !== 200) throw new Error(`Bob login failed: ${bobLoginRes.status}`)
    const bobLoginData = await bobLoginRes.json()
    if (bobLoginData.bootstrapRequired !== false) throw new Error('Expected bootstrapRequired: false')
    if (!bobLoginData.user || bobLoginData.user.is_admin === true) {
      throw new Error('Normal user should not be an administrator')
    }
    if (bobLoginData.user.oidc_issuer !== 'https://auth.example.com' || bobLoginData.user.oidc_subject !== 'user_bob_456') {
      throw new Error('Identity mapping mismatch for standard user')
    }
    console.log('✓ Test 7 passed: Normal OIDC login correctly provisions standard user.')

    // -------------------------------------------------------------
    // Test 8: Same (iss, sub) logging in again -> resolves to existing user
    // -------------------------------------------------------------
    console.log('Test 8: Re-login with existing user...')
    const aliceReLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oidcUser1Token}`,
      },
    })
    const aliceReLoginData = await aliceReLoginRes.json()
    if (!aliceReLoginData.user || aliceReLoginData.user.id !== bootstrapData.user.id) {
      throw new Error('Re-login did not resolve to same existing local user ID')
    }
    if (!aliceReLoginData.user.is_admin) {
      throw new Error('Admin user lost admin status on re-login')
    }
    console.log('✓ Test 8 passed: Existing user identity resolves consistently.')

    // -------------------------------------------------------------
    // Test 9: Same sub from different issuer -> treated as distinct identity
    // -------------------------------------------------------------
    console.log('Test 9: Same sub from different issuer...')
    const differentIssuerToken = createMockJwt({
      iss: 'https://another-idp.org',
      sub: 'user_alice_123', // same sub as Alice, but different issuer!
      name: 'Alice from Different IDP',
      email: 'alice@another-idp.org',
    })
    const diffIssuerLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${differentIssuerToken}`,
      },
    })
    const diffIssuerData = await diffIssuerLoginRes.json()
    if (!diffIssuerData.user || diffIssuerData.user.id === bootstrapData.user.id) {
      throw new Error('Different issuer with same sub collided with existing user!')
    }
    if (diffIssuerData.user.oidc_issuer !== 'https://another-idp.org') {
      throw new Error('Different issuer was not stored properly')
    }
    console.log('✓ Test 9 passed: Same sub from different issuer treated as distinct identity.')

    // -------------------------------------------------------------
    // Test 10: Concurrency - two simultaneous bootstrap requests
    // -------------------------------------------------------------
    console.log('Test 10: Concurrent bootstrap requests on fresh DB...')
    await resetDbForTests()
    resetBootstrapRateLimit()

    const userA_Token = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'concurrent_user_A',
      name: 'Candidate A',
    })
    const userB_Token = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'concurrent_user_B',
      name: 'Candidate B',
    })

    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA_Token}` },
        body: JSON.stringify({ bootstrapSecret: TEST_BOOTSTRAP_SECRET }),
      }),
      fetch(`${baseUrl}/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userB_Token}` },
        body: JSON.stringify({ bootstrapSecret: TEST_BOOTSTRAP_SECRET }),
      }),
    ])

    const statusA = resA.status
    const statusB = resB.status
    const oneCreated = (statusA === 201 && statusB !== 201) || (statusB === 201 && statusA !== 201)
    if (!oneCreated) {
      throw new Error(`Expected exactly one bootstrap to succeed (201). Got statuses: A=${statusA}, B=${statusB}`)
    }

    const finalAdminCount = await getAdminCount()
    if (finalAdminCount !== 1) {
      throw new Error(`Expected exactly 1 admin after race condition, got ${finalAdminCount}`)
    }
    console.log('✓ Test 10 passed: Race condition protection ensured exactly one initial admin created.')

    // -------------------------------------------------------------
    // Test 11: Rate limiting on failed bootstrap attempts
    // -------------------------------------------------------------
    console.log('Test 11: Rate limiting on failed bootstrap attempts...')
    await resetDbForTests()
    resetBootstrapRateLimit()

    const attackerToken = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'attacker_sub',
    })

    for (let i = 0; i < 5; i++) {
      const attemptRes = await fetch(`${baseUrl}/auth/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${attackerToken}` },
        body: JSON.stringify({ bootstrapSecret: `wrong_guess_${i}` }),
      })
      if (attemptRes.status !== 401) {
        throw new Error(`Attempt ${i + 1} expected 401, got ${attemptRes.status}`)
      }
    }

    // 6th attempt must be rate limited
    const blockedRes = await fetch(`${baseUrl}/auth/bootstrap-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${attackerToken}` },
      body: JSON.stringify({ bootstrapSecret: 'another_wrong_guess' }),
    })
    if (blockedRes.status !== 429) {
      throw new Error(`Expected 429 Too Many Requests after 5 failed attempts, got ${blockedRes.status}`)
    }
    console.log('✓ Test 11 passed: Rate limiting triggers 429 after repeated failed bootstrap attempts.')

    // -------------------------------------------------------------
    // Test 12: Admin managing users and roles via /api/users
    // -------------------------------------------------------------
    console.log('Test 12: Admin managing users and roles...')
    await resetDbForTests()
    resetBootstrapRateLimit()

    // 1. Create admin
    const adminToken = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'super_admin',
      name: 'Super Admin',
    })
    await fetch(`${baseUrl}/auth/bootstrap-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ bootstrapSecret: TEST_BOOTSTRAP_SECRET }),
    })

    // 2. Standard user logs in
    const standardToken = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'regular_user',
      name: 'Regular User',
    })
    const regRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${standardToken}` },
    })
    const regUserData = (await regRes.json()).user

    // 3. Standard user tries to access /api/users -> forbidden
    const forbiddenRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${standardToken}` },
    })
    if (forbiddenRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for non-admin, got ${forbiddenRes.status}`)
    }

    // 4. Admin lists users
    const adminListRes = await fetch(`${baseUrl}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (adminListRes.status !== 200) throw new Error(`Admin list failed: ${adminListRes.status}`)
    const userList = await adminListRes.json()
    if (!Array.isArray(userList) || userList.length !== 2) {
      throw new Error(`Expected 2 users in list, got ${userList.length}`)
    }

    // 5. Admin promotes standard user to admin
    const promoteRes = await fetch(`${baseUrl}/users/${regUserData.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ is_admin: true }),
    })
    if (promoteRes.status !== 200) throw new Error(`Promote user failed: ${promoteRes.status}`)
    const promotedUser = await promoteRes.json()
    if (!promotedUser.is_admin) throw new Error('Promoted user is not admin')

    const newAdminCount = await getAdminCount()
    if (newAdminCount !== 2) throw new Error(`Expected 2 admins after promotion, got ${newAdminCount}`)
    console.log('✓ Test 12 passed: Admin successfully viewed and managed user roles.')

    // -------------------------------------------------------------
    // Test 13: DocPouch & ID token header fallback authentication
    // -------------------------------------------------------------
    console.log('Test 13: Authentication via DocPouch format token and X-ID-Token / X-OIDC-* headers...')
    await resetDbForTests()
    resetBootstrapRateLimit()

    const docpouchAdminToken = createMockJwt({
      userId: 'docpouch_admin_user',
      userName: 'DocPouch Administrator',
      role: 'admin',
    })

    // Create a DocPouch admin via bootstrap
    const bootstrapDocpouchRes = await fetch(`${baseUrl}/auth/bootstrap-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${docpouchAdminToken}`,
        'X-OIDC-Issuer': 'http://localhost:3030/oidc',
        'X-OIDC-Subject': 'docpouch_admin_user',
      },
      body: JSON.stringify({ bootstrapSecret: TEST_BOOTSTRAP_SECRET }),
    })
    if (bootstrapDocpouchRes.status !== 201) {
      throw new Error(`Expected 201 Created for DocPouch admin bootstrap, got ${bootstrapDocpouchRes.status}`)
    }

    // Fetch users with X-ID-Token and X-OIDC headers (GET request, no request body)
    const docpouchHeaderRes = await fetch(`${baseUrl}/users`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${docpouchAdminToken}`,
        'X-OIDC-Issuer': 'http://localhost:3030/oidc',
        'X-OIDC-Subject': 'docpouch_admin_user',
      },
    })
    if (docpouchHeaderRes.status !== 200) {
      throw new Error(`Expected 200 OK with DocPouch header auth, got ${docpouchHeaderRes.status}`)
    }
    const headerUsers = await docpouchHeaderRes.json()
    if (!Array.isArray(headerUsers) || headerUsers.length < 1) {
      throw new Error('Expected user list to be returned via DocPouch header auth')
    }
    console.log('✓ Test 13 passed: DocPouch format tokens and OIDC headers authenticated successfully on GET requests.')

    // -------------------------------------------------------------
    // Test 14: Username resolution from preferred_username, username, or sub claims
    // -------------------------------------------------------------
    console.log('Test 14: Username resolution when explicit name claim is omitted...')
    await resetDbForTests()
    resetBootstrapRateLimit()

    // 14a. Bootstrap admin with only preferred_username
    const prefUserToken = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'user_sub_999',
      preferred_username: 'docpouch_boss',
    })
    const bootstrapPrefRes = await fetch(`${baseUrl}/auth/bootstrap-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${prefUserToken}`,
      },
      body: JSON.stringify({ bootstrapSecret: TEST_BOOTSTRAP_SECRET }),
    })
    if (bootstrapPrefRes.status !== 201) {
      throw new Error(`Expected 201 Created for bootstrap with preferred_username, got ${bootstrapPrefRes.status}`)
    }
    const bootstrapPrefData = await bootstrapPrefRes.json()
    if (bootstrapPrefData.user.name !== 'docpouch_boss') {
      throw new Error(`Expected admin user name to be 'docpouch_boss', got '${bootstrapPrefData.user.name}'`)
    }

    // 14b. Standard user login with only username in token
    const usernameOnlyToken = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'user_sub_888',
      username: 'docpouch_student_42',
    })
    const loginUsernameRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${usernameOnlyToken}`,
      },
    })
    if (loginUsernameRes.status !== 200) {
      throw new Error(`Expected 200 OK for login with username claim, got ${loginUsernameRes.status}`)
    }
    const loginUsernameData = await loginUsernameRes.json()
    if (loginUsernameData.user.name !== 'docpouch_student_42') {
      throw new Error(`Expected user name to be 'docpouch_student_42', got '${loginUsernameData.user.name}'`)
    }

    console.log('✓ Test 14 passed: Username correctly resolved from preferred_username and username claims.')

    // -------------------------------------------------------------
    // Test 15: Administrator manually changes locally used username and adds email
    // -------------------------------------------------------------
    console.log('Test 15: Administrator changes local username and adds email...')
    await resetDbForTests()
    resetBootstrapRateLimit()

    // 15a. Bootstrap admin
    const adminToken15 = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'admin_master',
      name: 'System Admin',
    })
    const adminBootRes = await fetch(`${baseUrl}/auth/bootstrap-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken15}`,
      },
      body: JSON.stringify({ bootstrapSecret: TEST_BOOTSTRAP_SECRET }),
    })
    if (adminBootRes.status !== 201) throw new Error('Bootstrap failed for Test 15')

    // 15b. Standard user logs in for first time with OIDC token
    const studentToken15 = createMockJwt({
      iss: 'https://auth.example.com',
      sub: 'student_123',
      name: 'raw_oidc_user',
    })
    const studentLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken15}`,
      },
    })
    if (studentLoginRes.status !== 200) throw new Error('Student login failed')
    const studentUser = (await studentLoginRes.json()).user
    if (studentUser.name !== 'raw_oidc_user' || studentUser.email !== '') {
      throw new Error(`Unexpected initial student user: ${JSON.stringify(studentUser)}`)
    }

    // 15c. Non-admin cannot modify user account
    const forbiddenPatchRes = await fetch(`${baseUrl}/users/${studentUser.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken15}`,
      },
      body: JSON.stringify({ name: 'Hacker Attempt', email: 'hack@bad.com' }),
    })
    if (forbiddenPatchRes.status !== 403) {
      throw new Error(`Expected 403 for non-admin PATCH, got ${forbiddenPatchRes.status}`)
    }

    // 15d. Admin validation: empty username should be rejected
    const invalidPatchRes = await fetch(`${baseUrl}/users/${studentUser.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken15}`,
      },
      body: JSON.stringify({ name: '   ' }),
    })
    if (invalidPatchRes.status !== 400) {
      throw new Error(`Expected 400 for empty username, got ${invalidPatchRes.status}`)
    }

    // 15e. Admin updates username to "Dr. Jane Doe" and adds email "jane.doe@university.edu"
    const patchRes = await fetch(`${baseUrl}/users/${studentUser.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken15}`,
      },
      body: JSON.stringify({
        name: 'Dr. Jane Doe',
        email: 'jane.doe@university.edu',
      }),
    })
    if (patchRes.status !== 200) {
      throw new Error(`Expected 200 for admin user update, got ${patchRes.status}`)
    }
    const updatedUser = await patchRes.json()
    if (updatedUser.name !== 'Dr. Jane Doe' || updatedUser.email !== 'jane.doe@university.edu') {
      throw new Error(`User update mismatch: ${JSON.stringify(updatedUser)}`)
    }

    // 15f. Subsequent login with raw OIDC token must preserve the admin's custom username and email
    const subsequentLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken15}`,
      },
    })
    if (subsequentLoginRes.status !== 200) throw new Error('Subsequent student login failed')
    const preservedUser = (await subsequentLoginRes.json()).user
    if (preservedUser.name !== 'Dr. Jane Doe' || preservedUser.email !== 'jane.doe@university.edu') {
      throw new Error(`Custom username and email were overwritten by OIDC claims: ${JSON.stringify(preservedUser)}`)
    }

    // 15g. GET /api/auth/me returns updated local user details
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${studentToken15}`,
      },
    })
    if (meRes.status !== 200) throw new Error(`GET /auth/me failed: ${meRes.status}`)
    const meData = await meRes.json()
    if (meData.user.name !== 'Dr. Jane Doe' || meData.user.email !== 'jane.doe@university.edu') {
      throw new Error(`/auth/me returned incorrect user data: ${JSON.stringify(meData)}`)
    }

    console.log('✓ Test 15 passed: Administrator successfully updated username and email, and changes persisted across logins.')

    console.log('\n=== All OIDC & Administrator Bootstrap Flow Tests Passed Successfully! ===')
    server.close(() => process.exit(0))
  } catch (err) {
    console.error('Test execution failed:', err)
    server.close(() => process.exit(1))
  }
}

runAuthBootstrapTests().catch(err => {
  console.error('Fatal error running tests:', err)
  process.exit(1)
})
