import { describe, expect, it } from "vitest"
import { shareUrl } from "./chatbot-builder"

describe("shareUrl", () => {
  it("turns the chatbot CRM's demo link into FreeSERP's own share link", () => {
    expect(shareUrl("https://whatsappchatbot.zootcloud.com/demo/urLX7xLDTYOxzHukuw9r9A", "https://app.freeserp.com")).toBe(
      "https://app.freeserp.com/share/chatbot/urLX7xLDTYOxzHukuw9r9A",
    )
    expect(shareUrl("https://whatsappchatbot.zootcloud.com/demo/urLX7xLDTYOxzHukuw9r9A", "")).toBe("/share/chatbot/urLX7xLDTYOxzHukuw9r9A")
  })

  it("gives no link without a live demo, or for anything that isn't a demo token", () => {
    expect(shareUrl(null, "https://app.freeserp.com")).toBeNull()
    expect(shareUrl("https://whatsappchatbot.zootcloud.com/admin/clients/x", "https://app.freeserp.com")).toBeNull()
    expect(shareUrl("https://whatsappchatbot.zootcloud.com/demo/short", "https://app.freeserp.com")).toBeNull()
    expect(shareUrl("https://whatsappchatbot.zootcloud.com/demo/a%2F..%2Fadmin1234", "https://app.freeserp.com")).toBeNull()
  })
})
