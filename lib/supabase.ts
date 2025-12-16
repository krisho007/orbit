import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function uploadContactImage(file: File, contactId: string): Promise<{ url: string, publicId: string }> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${contactId}-${Date.now()}.${fileExt}`
  const filePath = `contact-images/${fileName}`

  const { data, error } = await supabase.storage
    .from('orbit')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) {
    throw new Error(`Upload failed: ${error.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('orbit')
    .getPublicUrl(filePath)

  return {
    url: urlData.publicUrl,
    publicId: filePath
  }
}

export async function deleteContactImage(publicId: string) {
  const { error } = await supabase.storage
    .from('orbit')
    .remove([publicId])

  if (error) {
    throw new Error(`Delete failed: ${error.message}`)
  }
}

/**
 * Download an image from a URL and upload it to Supabase Storage
 * @param imageUrl - The URL of the image to download
 * @param contactId - The contact ID to associate the image with
 * @returns Object containing the uploaded image URL and publicId
 */
export async function downloadAndUploadImage(
  imageUrl: string, 
  contactId: string
): Promise<{ url: string; publicId: string } | null> {
  try {
    // Download the image from the URL
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.error(`Failed to download image from ${imageUrl}: ${response.statusText}`)
      return null
    }

    // Get the image as a buffer
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Determine file extension from content-type or default to jpg
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg'
    
    const fileName = `${contactId}-${Date.now()}.${ext}`
    const filePath = `contact-images/${fileName}`

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('orbit')
      .upload(filePath, buffer, {
        contentType,
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error(`Failed to upload image to Supabase: ${error.message}`)
      return null
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('orbit')
      .getPublicUrl(filePath)

    return {
      url: urlData.publicUrl,
      publicId: filePath
    }
  } catch (error) {
    console.error('Error downloading and uploading image:', error)
    return null
  }
}


