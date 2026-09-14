import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@geolibre/ui";
import { AlertTriangle, Loader2, LogOut, User } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useBeforeUnloadGuard } from "../../hooks/useBeforeUnloadGuard";
import {
  clearNativeSession,
  fetchNativeAccount,
  nativeSignIn,
  nativeSignOut,
  nativeSignUp,
  readNativeToken,
  type NativeAccount,
} from "../../lib/native-auth";

interface NativeGateProps {
  /** The self-hosted server API origin, already validated (HTTPS or loopback). */
  apiUrl: string;
  /** Product name on the sign-in screen, from VITE_GEOLIBRE_BRAND_NAME. */
  brandName: string;
  children: ReactNode;
}

type GateState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "error"; message: string }
  | { status: "signedIn"; account: NativeAccount; token: string };

/** Full-screen centered layout shared by the loading, error, and form screens. */
function AuthScreen({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <main
      {...(alert ? { role: "alert" } : {})}
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8"
    >
      {children}
    </main>
  );
}

/** The signed-in user's menu: username, plan, and sign-out. */
function UserMenu({
  account,
  onSignOut,
}: {
  account: NativeAccount;
  onSignOut: () => void;
}) {
  return (
    <div className="fixed end-2 top-2 z-[100]">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="账户"
            className="h-8 w-8 overflow-hidden rounded-full border border-border bg-background p-0 shadow-sm"
          >
            <User className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate text-start font-normal">
            {account.username}
            <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {account.plan === "pro" ? "专业版" : "免费版"}
            </span>
          </DropdownMenuLabel>
          {typeof account.projectCount === "number" ? (
            <DropdownMenuLabel className="text-start text-xs font-normal text-muted-foreground">
              项目用量：{account.projectCount}
              {account.projectLimit ? ` / ${account.projectLimit}` : "（不限）"}
            </DropdownMenuLabel>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOut className="me-2 h-4 w-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** The username/password form, toggling between sign-in and sign-up. */
function SignInForm({
  apiUrl,
  brandName,
  onSignedIn,
}: {
  apiUrl: string;
  brandName: string;
  onSignedIn: (account: NativeAccount, token: string) => void;
}) {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const action = mode === "signIn" ? nativeSignIn : nativeSignUp;
      const account = await action(apiUrl, username.trim(), password);
      // The token was just persisted by the action; read it back so the gate
      // state carries the same value the share client will use.
      onSignedIn(account, readNativeToken() ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthScreen>
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-6 text-start shadow-sm"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">{brandName}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signIn" ? "登录以继续使用云 GIS 工作台" : "注册一个新账户"}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="native-auth-username">用户名</Label>
          <Input
            id="native-auth-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="3-39 位小写字母、数字或连字符"
            required
            minLength={3}
            maxLength={39}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="native-auth-password">密码</Label>
          <Input
            id="native-auth-password"
            type="password"
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "signUp" ? "至少 8 位" : ""}
            required
            minLength={mode === "signUp" ? 8 : 1}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
          {mode === "signIn" ? "登录" : "注册并登录"}
        </Button>
        <Button
          type="button"
          variant="link"
          className="text-sm"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
        >
          {mode === "signIn" ? "没有账户？立即注册" : "已有账户？返回登录"}
        </Button>
      </form>
    </AuthScreen>
  );
}

/**
 * Whole-app sign-in gate backed by the deployment's own geolibre_server_api
 * account system — the self-hosted alternative to ClerkGate/Auth0Gate for SaaS
 * operators who run their own identity (and billing) stack. Dynamically
 * imported only when VITE_GEOLIBRE_NATIVE_AUTH_URL is configured.
 *
 * Like the sibling gates, this gates *rendering* only; the API enforces
 * ownership and quotas server-side. The issued token doubles as the share
 * credential, so the gate is what unlocks project upload for the session.
 */
export function NativeGate({ apiUrl, brandName, children }: NativeGateProps) {
  // See Auth0Gate: keeps the unsaved-work prompt alive on the signed-out
  // screens, where <App /> (and its own guard) is not mounted.
  useBeforeUnloadGuard();
  const [state, setState] = useState<GateState>({ status: "loading" });

  // Restore a persisted session: validate the stored token against the API so
  // an expired or revoked token never lets the app render. A network failure
  // keeps the session and shows the retry screen instead — a flaky connection
  // must not sign the user out.
  useEffect(() => {
    let cancelled = false;
    const token = readNativeToken();
    if (!token) {
      setState({ status: "signedOut" });
      return;
    }
    fetchNativeAccount(apiUrl, token)
      .then((account) => {
        if (cancelled) return;
        setState(account ? { status: "signedIn", account, token } : { status: "signedOut" });
      })
      .catch((cause) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: cause instanceof Error ? cause.message : "无法连接认证服务器",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          aria-hidden="true"
          className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <AuthScreen alert>
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">暂时无法连接服务</h1>
          <p className="max-w-md text-sm text-muted-foreground">{state.message}</p>
        </div>
        <Button
          onClick={() => {
            clearNativeSession();
            setState({ status: "signedOut" });
          }}
        >
          重新登录
        </Button>
      </AuthScreen>
    );
  }

  if (state.status === "signedOut") {
    return (
      <SignInForm
        apiUrl={apiUrl}
        brandName={brandName}
        onSignedIn={(account, token) => setState({ status: "signedIn", account, token })}
      />
    );
  }

  return (
    <>
      {children}
      <UserMenu
        account={state.account}
        onSignOut={() => {
          void nativeSignOut(apiUrl, state.token);
          setState({ status: "signedOut" });
        }}
      />
    </>
  );
}
