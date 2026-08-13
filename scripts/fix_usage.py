import os

fp = '/home/z/my-project/src/app/api/founder-panel/ai-config/usage/route.ts'
with open(fp) as f:
    c = f.read()

# Fix first broken cast
c = c.replace(
    'db\ncompanyMembership.findFirst({\n        where: { userId: auth.user.uid, companyId: company.id },\n      });\n      if (!membership) return apiError(\'Company not found or access denied\', 404);\n      \n      companyId = company.id;',
    'const membership = await db.companyMembership.findFirst({\n        where: { userUid: auth.user.uid, companySlug: company.slug },\n      });\n      if (!membership) return apiError(\'Company not found or access denied\', 404);\n      \n      companyId = company.id;'
)

# Fix second broken cast
c = c.replace(
    'db\ncompanyMembership.findFirst({\n        where: { userId: auth.user.uid },\n        include: { company: true },\n      });\n      \n      if (!membership) return apiError(\'No company membership found\', 403);\n      companyId = membership.companyId;',
    'const membership = await db.companyMembership.findFirst({\n        where: { userUid: auth.user.uid },\n        include: { company: true },\n      });\n      \n      if (!membership) return apiError(\'No company membership found\', 403);\n      companyId = membership.companySlug;'
)

# Remove stale comments
c = c.replace('// schema.prisma — accessed through a typed cast, see GET handler in\n      // /api/founder-panel/ai-config/route.ts for the same pattern.\n', '')
c = c.replace('// `unknown` to preserve runtime behavior without re-introducing `any`.\n', '')

with open(fp, 'w') as f:
    f.write(c)
print('Fixed!')
