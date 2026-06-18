package diffshape

import "testing"

func TestAnalyze(t *testing.T) {
	cases := []struct {
		name    string
		patch   string
		mech    bool
		wantSig string
	}{
		{
			name: "import rename, tilde path",
			patch: `@@ -1,1 +1,1 @@
-import {X} from "~/server/evaluations/evaluators.generated";
+import {X} from "~/server/evaluations/evaluators";`,
			mech:    true,
			wantSig: "evaluators.generated → evaluators",
		},
		{
			// Different surrounding import path, identical token edit: both
			// must collapse to the same signature.
			name: "import rename, relative path",
			patch: `@@ -1,1 +1,1 @@
-import {X} from "../server/evaluations/evaluators.generated";
+import {X} from "../server/evaluations/evaluators";`,
			mech:    true,
			wantSig: "evaluators.generated → evaluators",
		},
		{
			name: "identifier rename",
			patch: `@@ -1,1 +1,1 @@
-  return foo(x)
+  return bar(x)`,
			mech:    true,
			wantSig: "foo → bar",
		},
		{
			name: "same edit across two hunks",
			patch: `@@ -1,1 +1,1 @@
-return foo(x)
+return bar(x)
@@ -10,1 +10,1 @@
-y = foo(z)
+y = bar(z)`,
			mech:    true,
			wantSig: "foo → bar",
		},
		{
			name: "pure deletion of a token suffix renders empty side",
			patch: `@@ -1,1 +1,1 @@
-from "x/evaluators.generated"
+from "x/evaluators"`,
			mech:    true,
			wantSig: "evaluators.generated → evaluators",
		},
		{
			name: "genuine multi-line logic change",
			patch: `@@ -10,4 +10,4 @@
 func foo() {
-	total := compute(a, b)
-	return total * 2
+	sum := compute(a, b, c)
+	return sum + offset
 }`,
			mech:    false,
			wantSig: "",
		},
		{
			name: "unequal counts: 2 removed, 1 added",
			patch: `@@ -1,2 +1,1 @@
-line one
-line two
+merged line`,
			mech:    false,
			wantSig: "",
		},
		{
			name: "whole-line replacement, no shared prefix or suffix",
			patch: `@@ -1,1 +1,1 @@
-alpha
+bravo`,
			mech:    false,
			wantSig: "",
		},
		{
			name:    "empty patch",
			patch:   "",
			mech:    false,
			wantSig: "",
		},
		{
			name:    "no hunk header",
			patch:   "just some text\nwith no diff markers",
			mech:    false,
			wantSig: "",
		},
		{
			name: "CRLF line endings and trailing newline",
			patch: "@@ -1,1 +1,1 @@\r\n" +
				"-  return foo(x)\r\n" +
				"+  return bar(x)\r\n",
			mech:    true,
			wantSig: "foo → bar",
		},
		{
			name: "ignores no-newline marker",
			patch: "@@ -1,1 +1,1 @@\n" +
				"-  return foo(x)\n" +
				"\\ No newline at end of file\n" +
				"+  return bar(x)\n" +
				"\\ No newline at end of file",
			mech:    true,
			wantSig: "foo → bar",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gotMech, gotSig := Analyze(c.patch)
			if gotMech != c.mech || gotSig != c.wantSig {
				t.Errorf("Analyze(%q) = (%v, %q), want (%v, %q)",
					c.patch, gotMech, gotSig, c.mech, c.wantSig)
			}
		})
	}
}
