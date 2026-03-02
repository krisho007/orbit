package expo.modules.contactintent

import android.content.ContentResolver
import android.net.Uri
import android.provider.ContactsContract
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ContactIntentModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ContactIntent")

        Function("getContactFromIntent") {
            val activity = appContext.currentActivity
                ?: return@Function mapOf("hasIntent" to false, "phone" to "", "email" to "", "name" to "")

            val contactUri = activity.intent.getStringExtra("ORBIT_CONTACT_URI")
            if (contactUri.isNullOrEmpty()) {
                return@Function mapOf("hasIntent" to false, "phone" to "", "email" to "", "name" to "")
            }

            try {
                val uri = Uri.parse(contactUri)
                val resolver = activity.contentResolver
                val contactId = resolveContactId(resolver, uri)

                if (contactId != null) {
                    mapOf(
                        "hasIntent" to true,
                        "name" to (queryDisplayName(resolver, contactId) ?: ""),
                        "phone" to (queryPhone(resolver, contactId) ?: ""),
                        "email" to (queryEmail(resolver, contactId) ?: "")
                    )
                } else {
                    mapOf("hasIntent" to true, "name" to "", "phone" to "", "email" to "")
                }
            } catch (e: Exception) {
                mapOf("hasIntent" to true, "name" to "", "phone" to "", "email" to "")
            }
        }

        Function("clearIntent") {
            val activity = appContext.currentActivity ?: return@Function
            activity.intent.removeExtra("ORBIT_CONTACT_URI")
            activity.intent.data = null
        }
    }

    private fun resolveContactId(resolver: ContentResolver, uri: Uri): String? {
        try {
            resolver.query(
                uri,
                arrayOf(ContactsContract.Contacts._ID),
                null,
                null,
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    return cursor.getString(
                        cursor.getColumnIndexOrThrow(ContactsContract.Contacts._ID)
                    )
                }
            }
        } catch (_: Exception) {
            // URI format not recognized — caller should handle gracefully
        }
        return null
    }

    private fun queryDisplayName(resolver: ContentResolver, contactId: String): String? {
        resolver.query(
            ContactsContract.Contacts.CONTENT_URI,
            arrayOf(ContactsContract.Contacts.DISPLAY_NAME),
            "${ContactsContract.Contacts._ID} = ?",
            arrayOf(contactId),
            null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                return cursor.getString(
                    cursor.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME)
                )
            }
        }
        return null
    }

    private fun queryPhone(resolver: ContentResolver, contactId: String): String? {
        resolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
            "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
            arrayOf(contactId),
            null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                return cursor.getString(
                    cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
                )
            }
        }
        return null
    }

    private fun queryEmail(resolver: ContentResolver, contactId: String): String? {
        resolver.query(
            ContactsContract.CommonDataKinds.Email.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Email.ADDRESS),
            "${ContactsContract.CommonDataKinds.Email.CONTACT_ID} = ?",
            arrayOf(contactId),
            null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                return cursor.getString(
                    cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Email.ADDRESS)
                )
            }
        }
        return null
    }
}
