package classify

import "testing"

func TestFile(t *testing.T) {
	cases := []struct {
		path          string
		generatedAttr bool
		want          Stratum
	}{
		// Generated
		{"package-lock.json", false, Generated},
		{"sub/dir/go.sum", false, Generated},
		{"Cargo.lock", false, Generated},
		{"api/v1/service.pb.go", false, Generated},
		{"internal/models_gen.go", false, Generated},
		{"src/types.generated.ts", false, Generated},
		{"web/dist/index.js", false, Generated},
		{"vendor/github.com/foo/bar.go", false, Generated},
		{"src/__snapshots__/app.test.tsx.snap", false, Generated},
		{"assets/app.min.js", false, Generated},
		{"anything/at/all.go", true, Generated},
		// generated wins over tests when attribute is set
		{"pkg/thing_test.go", true, Generated},

		// Intent
		{"docs/adr/20260610-system-architecture.md", false, Intent},
		{"docs/decisions/0042-thing.md", false, Intent},
		{"specs/review-a-pull-request.feature", false, Intent},
		{"backend/docs/rfc/001-proposal.md", false, Intent},

		// Tests
		{"internal/classify/classify_test.go", false, Tests},
		{"web/src/App.test.tsx", false, Tests},
		{"web/src/lib/util.spec.ts", false, Tests},
		{"tests/integration/api.py", false, Tests},
		{"pkg/store/testdata/fixture.json", false, Tests},
		{"app/spec/models/user_spec.rb", false, Tests},

		// Core fallback
		{"cmd/api/main.go", false, Core},
		{"web/src/App.tsx", false, Core},
		{"README.md", false, Core},
		{"docs/guide.md", false, Core},
		// "specification" dir should not match the "spec" segment
		{"specification/api.md", false, Core},
	}

	for _, c := range cases {
		if got := File(c.path, c.generatedAttr); got != c.want {
			t.Errorf("File(%q, %v) = %s, want %s", c.path, c.generatedAttr, got, c.want)
		}
	}
}
