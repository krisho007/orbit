import { AssistantChat } from "@/components/assistant/assistant-chat"

export default function AssistantPage() {
  return (
    <div className="p-3 sm:p-4 md:p-8 h-full">
      <div className="max-w-4xl mx-auto h-full flex flex-col">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3 sm:mb-6">AI Assistant</h1>
        <AssistantChat />
      </div>
    </div>
  )
}
