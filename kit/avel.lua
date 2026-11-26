-- kit/avel.lua: AVEL seats in WezTerm. One workspace per client project, five tabs:
--   1 OSA    osa (leader i: inbox)  2 LEADS  axis | zero
--   3 BUILD  soap | fantem | kade 4 CHECK  rigg
--   5 OPS    atlas (leader b: board)
-- Every pane runs kit/seat.sh, which opens a named tmux session. Close WezTerm and nothing
-- stops; reopen and each pane reattaches to the same agent.
-- Lane panes (BUILD, CHECK) only attach: they wait for the lane's tmux session and never start
-- it, so opening the workspace spends nothing. Leader l starts the lanes.
--
-- Project fields: name, dir, autostart, and wsl = '<distro>' when WezTerm runs on Windows and
-- the repo lives in WSL. Panes then open in that WSL domain, and the commands WezTerm runs
-- itself (message, lanes, status line) go through wsl.exe.
--
-- Keys (leader = Ctrl+Space, then):
--   p  pick a project (opens its workspace)      1-5  jump to a tab
--   m  message: "<to> <text>", e.g. "soap use the new guard"   i  inbox for OSA in a new pane
--   b  board in a new pane                        l  start all lanes for this project
local wezterm = require 'wezterm'
local act = wezterm.action
local M = {}

local function q(s) return "'" .. tostring(s):gsub("'", "'\\''") .. "'" end
local function seat(dir, s) return { 'bash', '-lc', 'cd ' .. q(dir) .. ' && kit/seat.sh ' .. s } end

-- A lane pane: attach to the lane's tmux session once it exists; never start it here.
-- With LANES_ON=miosa, hand over to seat.sh, which attaches to the lane in the workspace.
local function lane_seat(dir, s)
  -- Sourced, not exported: tmux must never see project.env (kit/seat.sh says why).
  local script = 'cd ' .. q(dir) .. ' && . kit/project.env && '
    .. 'if [ "${LANES_ON:-local}" = miosa ]; then exec kit/seat.sh ' .. s .. '; fi; '
    .. 'n="$PROJECT-' .. s .. '"; while true; do '
    .. 'if tmux has-session -t "$n" 2>/dev/null; then tmux attach -t "$n"; '
    .. 'else clear; echo "' .. s .. ': lane not running. Leader l starts the lanes."; sleep 5; fi; done'
  return { 'bash', '-lc', script }
end

local LANE_SEATS = { soap = true, fantem = true, kade = true, rigg = true, fenn = true }
local function pane_args(dir, s) return LANE_SEATS[s] and lane_seat(dir, s) or seat(dir, s) end

-- A command WezTerm runs itself (not in a pane): through wsl.exe when the repo is in WSL.
local function host(p, script)
  if p.wsl then return { 'wsl.exe', '-d', p.wsl, '--', 'bash', '-lc', script } end
  return { 'bash', '-lc', script }
end

local function with_domain(p, spec)
  if p.wsl then spec.domain = { DomainName = 'WSL:' .. p.wsl } end
  return spec
end

local by_name = {}

function M.open(p)
  local tab, pane, win = wezterm.mux.spawn_window(with_domain(p, { workspace = p.name, cwd = p.dir, args = seat(p.dir, 'osa') }))
  tab:set_title 'OSA'
  local layout = {
    { 'LEADS', 'axis', 'zero' }, { 'BUILD', 'soap', 'fantem', 'kade' },
    { 'CHECK', 'rigg' }, { 'OPS', 'atlas' },
  }
  for _, t in ipairs(layout) do
    local ntab, left = win:spawn_tab(with_domain(p, { cwd = p.dir, args = pane_args(p.dir, t[2]) }))
    ntab:set_title(t[1])
    -- Extra seats split to the right in equal columns (two seats: 1/2 each, three: 1/3 each).
    for i = 3, #t do
      left = left:split(with_domain(p, { direction = 'Right', size = (#t - i + 1) / (#t - i + 2), cwd = p.dir, args = pane_args(p.dir, t[i]) }))
    end
  end
  tab:activate()
end

local function project_of(window)
  return by_name[window:active_workspace()]
end

local function run(p, args)
  wezterm.background_child_process(host(p, 'cd ' .. q(p.dir) .. ' && ' .. args))
end

function M.apply(config, projects)
  for _, p in ipairs(projects) do by_name[p.name] = p end
  config.leader = config.leader or { key = 'Space', mods = 'CTRL', timeout_milliseconds = 1500 }
  config.keys = config.keys or {}
  config.status_update_interval = 5000
  local function key(k, action) table.insert(config.keys, { key = k, mods = 'LEADER', action = action }) end

  local choices = {}
  for _, p in ipairs(projects) do table.insert(choices, { id = p.name, label = p.name .. '  ' .. p.dir }) end
  key('p', act.InputSelector {
    title = 'AVEL project', choices = choices,
    action = wezterm.action_callback(function(window, pane, id)
      if not id then return end
      local exists = false
      for _, n in ipairs(wezterm.mux.get_workspace_names()) do if n == id then exists = true end end
      if not exists then M.open(by_name[id]) end
      window:perform_action(act.SwitchToWorkspace { name = id }, pane)
    end),
  })
  for i = 1, 5 do key(tostring(i), act.ActivateTab(i - 1)) end

  key('m', act.PromptInputLine {
    description = 'Message: <to> <text>   (to = osa, axis, zero, soap, fantem, rigg, fenn, atlas, leads, builders, all)',
    action = wezterm.action_callback(function(window, _, line)
      local p = project_of(window)
      if not p or not line or line == '' then return end
      local to, text = line:match('^(%S+)%s+(.+)$')
      if to then run(p, 'AVEL_AGENT=javaris python3 kit/msg.py send ' .. q(to) .. ' ' .. q(text)) end
    end),
  })
  key('i', wezterm.action_callback(function(window, pane)
    local p = project_of(window)
    if p then pane:split(with_domain(p, { direction = 'Bottom', size = 0.3, cwd = p.dir, args = seat(p.dir, 'inbox:osa') })) end
  end))
  key('b', wezterm.action_callback(function(window, pane)
    local p = project_of(window)
    if p then pane:split(with_domain(p, { direction = 'Bottom', size = 0.4, cwd = p.dir, args = seat(p.dir, 'board') })) end
  end))
  key('l', wezterm.action_callback(function(window)
    local p = project_of(window)
    if p then run(p, '[ "$(. kit/project.env; echo ${LANES_ON:-local})" = miosa ] && kit/miosa.sh lanes || kit/seat.sh lanes') end
  end))

  -- Right status: project and lane counts from the shared state. Re-read at most every 15 s,
  -- because under WSL each read starts wsl.exe.
  local last = {}
  wezterm.on('update-right-status', function(window)
    local p = project_of(window)
    if not p then window:set_right_status(''); return end
    local c = last[p.name]
    if not c or os.time() - c.at >= 15 then
      local ok, out = wezterm.run_child_process(host(p,
        'cd ' .. q(p.dir) .. ' && python3 kit/plan.py board 2>/dev/null | tail -1'))
      c = { at = os.time(), text = ((ok and out or ''):gsub('%s+$', '')) }
      last[p.name] = c
    end
    window:set_right_status(wezterm.format { { Text = ' ' .. p.name .. '  ' .. c.text .. ' ' } })
  end)

  -- Open a project's workspace from a shell: a pane that sets the user var avel_open to the
  -- project name, e.g. printf '\033]1337;SetUserVar=avel_open=%s\007' "$(printf mentoring-minds | base64)"
  wezterm.on('user-var-changed', function(window, pane, name, value)
    if name ~= 'avel_open' or not by_name[value] then return end
    local exists = false
    for _, n in ipairs(wezterm.mux.get_workspace_names()) do if n == value then exists = true end end
    if not exists then M.open(by_name[value]) end
    window:perform_action(act.SwitchToWorkspace { name = value }, pane)
  end)

  wezterm.on('gui-startup', function()
    local first
    for _, p in ipairs(projects) do if p.autostart then M.open(p); first = first or p.name end end
    if first then wezterm.mux.set_active_workspace(first) end  -- only a workspace that was opened
  end)
  return config
end

return M
