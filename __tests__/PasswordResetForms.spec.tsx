import {
  requestPasswordReset,
  resetPassword,
} from "@/actions/passwordReset.actions";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import SigninForm from "@/components/auth/SigninForm";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/actions/passwordReset.actions", () => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("@/actions/auth.actions", () => ({
  authenticate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

describe("password reset UI", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the forgot password link on sign in only when reset is available", () => {
    const { unmount } = render(<SigninForm />);
    expect(screen.queryByText("Forgot password?")).not.toBeInTheDocument();
    unmount();

    render(<SigninForm canResetPassword />);
    expect(screen.getByText("Forgot password?")).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("confirms the request without saying whether the account exists", async () => {
    (requestPasswordReset as any).mockResolvedValue({ success: true });
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "If an account exists for ada@example.com",
      );
    });
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "ada@example.com",
    });
  });

  it("requires both new password fields to match", async () => {
    render(<ResetPasswordForm token="tok" />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "abcdef" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "abcdeg" },
    });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    });
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("submits the token with the new password and offers to sign in", async () => {
    (resetPassword as any).mockResolvedValue({ success: true });
    render(<ResetPasswordForm token="tok" />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "abcdef" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "abcdef" },
    });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
        "href",
        "/signin",
      );
    });
    expect(resetPassword).toHaveBeenCalledWith({
      token: "tok",
      password: "abcdef",
      confirmPassword: "abcdef",
    });
  });
});
