//go:build windows

package main

import (
	"os/exec"
	"strconv"
)

func startGroup(cmd *exec.Cmd) {}

// killTree stops the command and the node process that npx spawns.
func killTree(cmd *exec.Cmd) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	return exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid)).Run()
}
