<#
.SYNOPSIS
  Find generated-glossary key definitions and usages.
.EXAMPLE
  scripts\glossary-search.ps1 defs
  scripts\glossary-search.ps1 usages jl:domain.output.replace
  scripts\glossary-search.ps1 keys -Prefix jl: -Path .
#>
[CmdletBinding(PositionalBinding = $false)]
	param(
	[Parameter(Mandatory, Position = 0)]
	[ValidateSet('defs', 'refs', 'usages', 'keys')]
	[string]$Mode,
	[Parameter(Position = 1)]
	[string]$Key,
	[string]$Prefix = 'jl:',
	[string]$Path = '.',
	[string[]]$RgArgs
)
# NOTE: PowerShell has no bare "--" passthrough for scripts (it binds as a
# parameter name), so extra rg args go via -RgArgs, e.g.
#   glossary-search.ps1 defs -RgArgs '-g','!internal/glossary/**'
$Extra = @($RgArgs)

function Escape-Regex([string]$s) { [regex]::Escape($s) }

$seg = '[a-z0-9]+(-[a-z0-9]+)*'
$keyPat = "$(Escape-Regex $Prefix)${seg}(\.${seg})+"
# $tokPat lists key-like tokens (a dot is required, so bare "Key"/
# "Description" block markers and "..." ellipses never match).
$tokPat = "$(Escape-Regex $Prefix)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+"

$useRg = $null -ne (Get-Command rg -ErrorAction SilentlyContinue)
$useGit = $null -ne (Get-Command git -ErrorAction SilentlyContinue)

if ($useRg) {
	$excludes = @('-g', '!*_test.go', '-g', '!*.test.ts', '-g', '!*.spec.ts', '-g', '!GLOSSARY.md', '-g', '!node_modules/**', '-g', '!frontend/bindings/**')
	switch ($Mode) {
		'defs' { & rg -N --no-heading @excludes -e "${keyPat}\s*=" -e "$(Escape-Regex $Prefix)Key:" @Extra -- $Path; exit $LASTEXITCODE }
		'refs' { & rg -N --no-heading @excludes -e "ref:$(Escape-Regex $Prefix)[A-Za-z0-9.~-]+" @Extra -- $Path; exit $LASTEXITCODE }
		'usages' {
			if (-not $Key) { Write-Error 'usages mode needs a KEY argument.'; exit 2 }
			& rg -N --no-heading -e (Escape-Regex $Key) @Extra -- $Path; exit $LASTEXITCODE
		}
		'keys' { & rg -N --no-heading -o -e $tokPat @Extra -- $Path | Sort-Object -Unique; exit $LASTEXITCODE }
	}
}
elseif ($useGit) {
	Write-Warning 'rg not found, falling back to git grep.'
	switch ($Mode) {
		'defs' { & git -C $Path grep -n -I -E -e "${keyPat}\s*=" -e "$(Escape-Regex $Prefix)Key:" -- . ':!*_test.go' ':!GLOSSARY.md' @Extra; exit $LASTEXITCODE }
		'refs' { & git -C $Path grep -n -I -E -e "ref:$(Escape-Regex $Prefix)[A-Za-z0-9.~-]+" -- . ':!*_test.go' ':!GLOSSARY.md' @Extra; exit $LASTEXITCODE }
		'usages' {
			if (-not $Key) { Write-Error 'usages mode needs a KEY argument.'; exit 2 }
			& git -C $Path grep -n -I -F -e $Key -- . @Extra; exit $LASTEXITCODE
		}
		'keys' {
			& git -C $Path grep -n -I -o -E -e $tokPat -- . @Extra |
				ForEach-Object { $_ -replace '^.*:', '' } | Sort-Object -Unique
			exit $LASTEXITCODE
		}
	}
}
else {
	Write-Error 'glossary-search: need rg or git on PATH.'
	exit 1
}
