import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhoneNumberInput } from "./PhoneNumberInput";
import { normalizeMobile, validateNationalMobile } from "./mobile";

function Example({ initial = "", country }: { initial?: string; country?: string }) {
  const [phone, setPhone] = useState(initial);
  return (
    <>
      <label htmlFor="phone">شماره موبایل</label>
      <PhoneNumberInput id="phone" value={phone} country={country} onValueChange={setPhone} />
      <output data-testid="canonical">{phone}</output>
    </>
  );
}

describe("international mobile input", () => {
  it("defaults to Iran, translates digits and adds the prefix exactly once", () => {
    render(<Example />);
    expect(screen.getByRole("combobox")).toHaveValue("IR");
    expect(screen.getByLabelText("پیش‌شماره کشور")).toHaveTextContent("+98");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "۹۱۲۱۲۳۴۵۶۷" } });
    expect(screen.getByTestId("canonical")).toHaveTextContent("+989121234567");
    expect(screen.getByRole("textbox")).toHaveValue("9121234567");
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
  });

  it("rejects a leading trunk zero and a repeated country code without silently changing identity", () => {
    render(<Example />);
    for (const value of ["09121234567", "989121234567", "+989121234567"]) {
      fireEvent.change(screen.getByRole("textbox"), { target: { value } });
      expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    }
    expect(validateNationalMobile("9891234567", "IR")).toBeUndefined();
  });

  it("clears the previous number and changes prefix and example on country selection", () => {
    render(<Example initial="+989121234567" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "TR" } });
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByLabelText("پیش‌شماره کشور")).toHaveTextContent("+90");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "5012345678" } });
    expect(screen.getByTestId("canonical")).toHaveTextContent("+905012345678");
  });

  it("loads the saved country even when calling codes are shared", () => {
    render(<Example country="CA" initial="+15062345678" />);
    expect(screen.getByRole("combobox")).toHaveValue("CA");
    expect(screen.getByRole("textbox")).toHaveValue("5062345678");
    expect(normalizeMobile("+447400123456")).toBe("+447400123456");
  });
});
