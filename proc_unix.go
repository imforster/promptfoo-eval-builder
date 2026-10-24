//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

// startGroup puts the command in its own process group so killTree can stop the
// node process that npx spawns, not just npx itself.
func startGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func killTree(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}
