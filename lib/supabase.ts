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

  // Get signed URL that expires in 1 year (maximum allowed)
  const { data: urlData, error: signError } = await supabase.storage
    .from('orbit')
    .createSignedUrl(filePath, 31536000) // 1 year in seconds

  if (signError || !urlData) {
    throw new Error(`Failed to create signed URL: ${signError?.message}`)
  }

  return {
    url: urlData.signedUrl,
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

    // Get signed URL that expires in 1 year
    const { data: urlData, error: signError } = await supabase.storage
      .from('orbit')
      .createSignedUrl(filePath, 31536000)

    if (signError || !urlData) {
      console.error(`Failed to create signed URL: ${signError?.message}`)
      return null
    }

    return {
      url: urlData.signedUrl,
      publicId: filePath
    }
  } catch (error) {
    console.error('Error downloading and uploading image:', error)
    return null
  }
}

/**
 * Upload a base64-encoded image to Supabase Storage
 * @param base64Data - The base64-encoded image data (without data URL prefix)
 * @param contentType - The MIME type of the image (e.g., 'image/jpeg')
 * @param contactId - The contact ID to associate the image with
 * @returns Object containing the uploaded image URL and publicId
 */
export async function uploadBase64Image(
  base64Data: string,
  contentType: string,
  contactId: string
): Promise<{ url: string; publicId: string } | null> {
  try {
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64')

    // Determine file extension from content-type
    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg'

    const fileName = `${contactId}-${Date.now()}.${ext}`
    const filePath = `contact-images/${fileName}`

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from('orbit')
      .upload(filePath, buffer, {
        contentType,
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error(`Failed to upload base64 image to Supabase: ${error.message}`)
      return null
    }

    // Get signed URL that expires in 1 year (maximum allowed)
    // This allows private bucket while still enabling image access
    const { data: urlData, error: signError } = await supabase.storage
      .from('orbit')
      .createSignedUrl(filePath, 31536000) // 1 year in seconds

    if (signError || !urlData) {
      console.error(`Failed to create signed URL: ${signError?.message}`)
      return null
    }

    return {
      url: urlData.signedUrl,
      publicId: filePath
    }
  } catch (error) {
    console.error('Error uploading base64 image:', error)
    return null
  }
}

/**
 * Refresh a signed URL for a contact image
 * Call this when a signed URL expires (after 1 year)
 * @param publicId - The storage path of the image
 * @returns New signed URL or null if failed
 */
export async function refreshImageSignedUrl(publicId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('orbit')
      .createSignedUrl(publicId, 31536000) // 1 year

    if (error || !data) {
      console.error(`Failed to refresh signed URL: ${error?.message}`)
      return null
    }    return data.signedUrl
  } catch (error) {
    console.error('Error refreshing signed URL:', error)
    return null
  }
}
