import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

/**
 * Script to create the founder account
 */
async function createFounder() {
  try {
    const email = process.env.FOUNDER_EMAIL || 'founder@garfix.app'
    const password = process.env.FOUNDER_PASSWORD || 'DefaultPass123'

    console.log(`🌱 Creating founder account: ${email}`)

    // Create company if needed
    const company = await db.company.upsert({
      where: { slug: 'gfx-founder' },
      update: {},
      create: {
        name: 'Founder Company',
        slug: 'gfx-founder',
        currency: 'USD',
        vatNumber: 'FOUNDER-001',
        address: 'Founder Address',
        currencyDecimalPlaces: 2,
      },
    })
    console.log(`✅ Company: ${company.name}`)

    // Create founder user
    const user = await db.appUser.upsert({
      where: { email },
      update: {
        role: 'founder',
      },
      create: {
        uid: 'founder-001',
        email,
        passwordHash: await hashPassword(password),
        displayName: 'Founder',
        role: 'founder',
        companies: JSON.stringify([company.slug]),
      },
    })
    console.log(`✅ Founder user created: ${user.email} (${user.uid})`)
    console.log(`   Role: ${user.role}`)
    console.log(`   Display Name: ${user.displayName}`)

    console.log('\n🎉 Founder account is ready!')
    console.log(`   Email: ${email}`)
    console.log(`   Password: ${password}`)
    console.log(`   Login at: http://localhost:3000/login`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Error creating founder:', error)
    process.exit(1)
  }
}

createFounder()
