"use client"

import { useState } from "react"
import { createTag, updateTag, deleteTag } from "@/app/(app)/settings/actions"
import { FiPlus, FiEdit2, FiTrash2, FiX } from "react-icons/fi"

type Tag = {
  id: string
  name: string
  color: string | null
  _count: {
    contacts: number
  }
}

interface TagsManagerProps {
  tags: Tag[]
}

export function TagsManager({ tags }: TagsManagerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {isCreating ? <FiX /> : <FiPlus />}
          {isCreating ? 'Cancel' : 'New Tag'}
        </button>
      </div>

      {isCreating && (
        <form
          action={async (formData) => {
            await createTag(formData)
            setIsCreating(false)
          }}
          className="mb-6 p-4 bg-gray-50 rounded-lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Tag Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-1">
                Color
              </label>
              <input
                type="color"
                id="color"
                name="color"
                defaultValue="#3B82F6"
                className="w-full h-10 px-1 py-1 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <button
            type="submit"
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Create Tag
          </button>
        </form>
      )}

      <div className="space-y-2">
        {tags.map((tag) => (
          <div key={tag.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            {editingId === tag.id ? (
              <form
                action={async (formData) => {
                  await updateTag(tag.id, formData)
                  setEditingId(null)
                }}
                className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                <input
                  type="text"
                  name="name"
                  defaultValue={tag.name}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
                <input
                  type="color"
                  name="color"
                  defaultValue={tag.color || '#3B82F6'}
                  className="h-10 px-1 py-1 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: tag.color || '#3B82F6' }}
                  />
                  <span className="font-medium text-gray-900">{tag.name}</span>
                  <span className="text-sm text-gray-500">
                    ({tag._count.contacts} contact{tag._count.contacts !== 1 ? 's' : ''})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingId(tag.id)}
                    className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <FiEdit2 className="h-4 w-4" />
                  </button>
                  <form
                    action={async () => {
                      if (confirm(`Delete tag "${tag.name}"? This will remove it from all contacts.`)) {
                        await deleteTag(tag.id)
                      }
                    }}
                  >
                    <button
                      type="submit"
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <FiTrash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {tags.length === 0 && !isCreating && (
        <p className="text-center text-gray-500 py-8">
          No tags yet. Create your first tag to organize your contacts.
        </p>
      )}
    </div>
  )
}


