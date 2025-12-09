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


