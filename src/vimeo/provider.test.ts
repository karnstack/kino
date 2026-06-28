import { describe, it, expect } from "vitest"
import { parseVimeoSource, playerUrl } from "./provider"

describe("parseVimeoSource", () => {
  it("passes a bare numeric id through", () => {
    expect(parseVimeoSource("123456789")).toEqual({ id: "123456789" })
  })
  it("extracts id from a vimeo.com URL", () => {
    expect(parseVimeoSource("https://vimeo.com/123456789")).toEqual({
      id: "123456789",
    })
  })
  it("extracts id + hash from an unlisted share URL", () => {
    expect(parseVimeoSource("https://vimeo.com/123456789/abcdef0123")).toEqual({
      id: "123456789",
      hash: "abcdef0123",
    })
  })
  it("extracts id + hash from a player.vimeo.com ?h= URL", () => {
    expect(
      parseVimeoSource("https://player.vimeo.com/video/123456789?h=xyz789"),
    ).toEqual({ id: "123456789", hash: "xyz789" })
  })
  it("returns input unchanged as id when no number is found", () => {
    expect(parseVimeoSource("not-a-vimeo")).toEqual({ id: "not-a-vimeo" })
  })
})

describe("playerUrl", () => {
  it("builds the documented ?h= embed URL", () => {
    expect(playerUrl("123456789", "abc")).toBe(
      "https://player.vimeo.com/video/123456789?h=abc",
    )
  })
})
