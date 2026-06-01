import { useAtom } from "jotai"
import { Switch } from "@/components/ui/base-ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"

export function WordLearningToggle() {
  const [wordLearning, setWordLearning] = useAtom(configFieldsAtomMap.wordLearning)

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] font-medium">乔木单词学习</span>
      <Switch
        checked={wordLearning.enabled}
        onCheckedChange={checked =>
          setWordLearning({ ...wordLearning, enabled: checked })}
      />
    </div>
  )
}
