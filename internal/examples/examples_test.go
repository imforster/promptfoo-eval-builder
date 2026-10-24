package examples

import (
	"io/fs"
	"strings"
	"testing"

	"promptfoo-eval-builder/internal/evalconfig"
	"promptfoo-eval-builder/internal/kit"
)

func TestExamplesLoadIntoTheForm(t *testing.T) {
	listed := map[string]bool{}
	for _, ex := range All {
		listed[ex.ID] = true
		c, err := Load(ex.ID)
		if err != nil {
			t.Fatalf("%s: %v", ex.ID, err)
		}
		// Every section should be editable in the form, not left in Advanced.
		if c.Extra != "" {
			t.Errorf("%s: unmodeled YAML:\n%s", ex.ID, c.Extra)
		}
		text, err := evalconfig.ToYAML(c)
		if err != nil {
			t.Fatalf("%s: %v", ex.ID, err)
		}
		if used := kit.Check("", text).Used; used != ex.Kit {
			t.Errorf("%s: Kit is %v but config uses kit files: %v", ex.ID, ex.Kit, used)
		}
	}
	entries, _ := fs.ReadDir(files, "configs")
	for _, e := range entries {
		if id := strings.TrimSuffix(e.Name(), ".yaml"); !listed[id] {
			t.Errorf("configs/%s is not listed in All", e.Name())
		}
	}
}
