"use client"

import { useState, useRef } from "react"
import { FiUpload, FiX, FiImage } from "react-icons/fi"

interface ImageUploadProps {
  currentImageUrl?: string | null
  onImageSelect: (file: File | null) => void
  onImageRemove?: () => void
}

export function ImageUpload({ currentImageUrl, onImageSelect, onImageRemove }: ImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file")
      return
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      alert("Image size must be less than 5MB")
      return
    }

    // Create preview URL
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    onImageSelect(file)
  }

  const handleRemove = () => {
    setPreviewUrl(null)
    onImageSelect(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    onImageRemove?.()
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
        Profile Photo
      </label>
      
      <div className="flex items-center gap-4">
        {/* Avatar Preview */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-3xl shadow-lg">
            {previewUrl ? (
              <img 
                src={previewUrl} 
                alt="Profile preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <FiImage className="h-10 w-10" />
            )}
          </div>
          
          {previewUrl && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
              title="Remove image"
            >
              <FiX className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Upload Button */}
        <div className="flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <button
            type="button"
            onClick={handleClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-gray-700 dark:text-gray-300 font-medium shadow-sm"
          >
            <FiUpload className="h-4 w-4" />
            {previewUrl ? "Change Photo" : "Upload Photo"}
          </button>
          
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            JPG, PNG or GIF. Max size 5MB.
          </p>
        </div>
      </div>
    </div>
  )
}




