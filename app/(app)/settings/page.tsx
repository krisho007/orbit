import { auth, signOut } from "@/auth"
import { prisma } from "@/lib/prisma"
import { TagsManager } from "@/components/settings/tags-manager"
import { RelationshipTypesManager } from "@/components/settings/relationship-types-manager"
import { MobileTokensManager } from "@/components/settings/mobile-tokens-manager"
import { getRelationshipTypes } from "@/app/(app)/settings/actions"
import { listMobileTokens } from "@/lib/auth/mobile-token"
import { FiLogOut, FiUser, FiTag, FiUsers, FiSmartphone } from "react-icons/fi"

export default async function SettingsPage() {
  const session = await auth()
  
  const [tags, relationshipTypes, mobileTokens] = await Promise.all([
    prisma.tag.findMany({
      where: { userId: session!.user.id },
      include: {
        _count: {
          select: { contacts: true }
        }
      },
      orderBy: { name: 'asc' }
    }),
    getRelationshipTypes(),
    listMobileTokens(session!.user.id)
  ])

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Settings</h1>

        {/* Profile Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center mb-4">
            <FiUser className="mr-2 h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <p className="text-gray-900">{session?.user?.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <p className="text-gray-900">{session?.user?.email}</p>
            </div>
            
            <form
              action={async () => {
                "use server"
                await signOut({ redirectTo: '/' })
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <FiLogOut className="h-4 w-4" />
                Sign Out
              </button>
            </form>
          </div>
        </div>

        {/* Mobile App / Caller ID */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex items-center mb-4">
            <FiSmartphone className="mr-2 h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Mobile App & Caller ID</h2>
          </div>

          <MobileTokensManager
            tokens={mobileTokens.map(t => ({
              ...t,
              lastUsedAt: t.lastUsedAt.toISOString(),
              expiresAt: t.expiresAt.toISOString(),
              createdAt: t.createdAt.toISOString(),
            }))}
          />
        </div>

        {/* Tags Management */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex items-center mb-4">
            <FiTag className="mr-2 h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Manage Tags</h2>
          </div>
          
          <TagsManager tags={tags} />
        </div>

        {/* Relationship Types Management */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <FiUsers className="mr-2 h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Manage Relationship Types</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Define relationship types to link contacts together. Symmetric relationships (like Spouse or Friend) are the same in both directions.
            Asymmetric relationships (like Parent/Child) can have different reverse types based on gender.
          </p>
          
          <RelationshipTypesManager relationshipTypes={relationshipTypes} />
        </div>
      </div>
    </div>
  )
}
