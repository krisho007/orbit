"use client"

import { useState } from "react"
import { createRelationshipType, updateRelationshipType, deleteRelationshipType } from "@/app/(app)/settings/actions"
import { FiPlus, FiEdit2, FiTrash2, FiX, FiLink, FiRepeat } from "react-icons/fi"

type RelationshipType = {
  id: string
  name: string
  isSymmetric: boolean
  isSystem: boolean
  reverseTypeId: string | null
  maleReverseTypeId: string | null
  femaleReverseTypeId: string | null
  reverseType: { id: string; name: string } | null
  maleReverseType: { id: string; name: string } | null
  femaleReverseType: { id: string; name: string } | null
  _count: {
    relationships: number
  }
}

interface RelationshipTypesManagerProps {
  relationshipTypes: RelationshipType[]
}

export function RelationshipTypesManager({ relationshipTypes }: RelationshipTypesManagerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSymmetric, setIsSymmetric] = useState(false)

  // Filter out types that can be used as reverse types
  const availableReverseTypes = relationshipTypes.filter(t => !t.isSymmetric)

  const getReverseDisplay = (type: RelationshipType) => {
    if (type.isSymmetric) {
      return <span className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1"><FiRepeat className="h-3 w-3" /> Symmetric</span>
    }
    
    const parts = []
    if (type.maleReverseType) {
      parts.push(`♂ ${type.maleReverseType.name}`)
    }
    if (type.femaleReverseType) {
      parts.push(`♀ ${type.femaleReverseType.name}`)
    }
    if (type.reverseType && !type.maleReverseType && !type.femaleReverseType) {
      parts.push(type.reverseType.name)
    }
    
    if (parts.length === 0) return null
    return <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><FiLink className="h-3 w-3" /> {parts.join(' / ')}</span>
  }

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => {
            setIsCreating(!isCreating)
            setIsSymmetric(false)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
        >
          {isCreating ? <FiX /> : <FiPlus />}
          {isCreating ? 'Cancel' : 'New Relationship Type'}
        </button>
      </div>

      {isCreating && (
        <form
          action={async (formData) => {
            await createRelationshipType(formData)
            setIsCreating(false)
            setIsSymmetric(false)
          }}
          className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-4"
        >
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Relationship Type Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              placeholder="e.g., Uncle, Aunt, Cousin"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isSymmetric"
                value="true"
                checked={isSymmetric}
                onChange={(e) => setIsSymmetric(e.target.checked)}
                className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Symmetric relationship (e.g., Spouse, Friend, Sibling)
              </span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
              Symmetric relationships are the same in both directions
            </p>
          </div>

          {!isSymmetric && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="reverseTypeId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Default Reverse Type
                </label>
                <select
                  id="reverseTypeId"
                  name="reverseTypeId"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">None</option>
                  {availableReverseTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="maleReverseTypeId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reverse for Male ♂
                </label>
                <select
                  id="maleReverseTypeId"
                  name="maleReverseTypeId"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">None</option>
                  {availableReverseTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="femaleReverseTypeId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reverse for Female ♀
                </label>
                <select
                  id="femaleReverseTypeId"
                  name="femaleReverseTypeId"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">None</option>
                  {availableReverseTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            Create Relationship Type
          </button>
        </form>
      )}

      <div className="space-y-2">
        {relationshipTypes.map((type) => (
          <div key={type.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            {editingId === type.id ? (
              <EditForm 
                type={type} 
                availableReverseTypes={availableReverseTypes}
                onCancel={() => setEditingId(null)}
                onSave={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{type.name}</span>
                    {type.isSystem && (
                      <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                        System
                      </span>
                    )}
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({type._count.relationships} relationship{type._count.relationships !== 1 ? 's' : ''})
                    </span>
                  </div>
                  {getReverseDisplay(type)}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingId(type.id)}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-orange-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <FiEdit2 className="h-4 w-4" />
                  </button>
                  {!type.isSystem && (
                    <form
                      action={async () => {
                        if (confirm(`Delete relationship type "${type.name}"? This will remove all relationships of this type.`)) {
                          await deleteRelationshipType(type.id)
                        }
                      }}
                    >
                      <button
                        type="submit"
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {relationshipTypes.length === 0 && !isCreating && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">
          No relationship types yet. Create your first relationship type to link contacts.
        </p>
      )}
    </div>
  )
}

function EditForm({ 
  type, 
  availableReverseTypes,
  onCancel,
  onSave 
}: { 
  type: RelationshipType
  availableReverseTypes: RelationshipType[]
  onCancel: () => void
  onSave: () => void
}) {
  const [isSymmetric, setIsSymmetric] = useState(type.isSymmetric)

  return (
    <form
      action={async (formData) => {
        await updateRelationshipType(type.id, formData)
        onSave()
      }}
      className="flex-1 space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          type="text"
          name="name"
          defaultValue={type.name}
          required
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="isSymmetric"
            value="true"
            checked={isSymmetric}
            onChange={(e) => setIsSymmetric(e.target.checked)}
            className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Symmetric</span>
        </label>
      </div>

      {!isSymmetric && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            name="reverseTypeId"
            defaultValue={type.reverseTypeId || ''}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">Default Reverse: None</option>
            {availableReverseTypes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            name="maleReverseTypeId"
            defaultValue={type.maleReverseTypeId || ''}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">♂ Male Reverse: None</option>
            {availableReverseTypes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            name="femaleReverseTypeId"
            defaultValue={type.femaleReverseTypeId || ''}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-orange-500 focus:border-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">♀ Female Reverse: None</option>
            {availableReverseTypes.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}


