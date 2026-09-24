<#
.SYNOPSIS
    Fetch clean Markdown from a public URL via markdown.new.

.DESCRIPTION
    Converts any public web page to AI-ready Markdown using the markdown.new
    service (https://markdown.new). Writes the Markdown to stdout or to a file.

.EXAMPLE
    .\get-markdown.ps1 -Url 'https://example.com'

.EXAMPLE
    .\get-markdown.ps1 -Url 'https://example.com' -OutFile page.md -Method browser -RetainImages

.EXAMPLE
    .\get-markdown.ps1 -Url 'https://example.com' -Method browser
#>
[CmdletBinding()]
param(
    # The public web page URL to convert.
    [Parameter(Mandatory)]
    [ValidatePattern('^https?://')]
    [string]$Url,

    # Optional output file. If omitted, Markdown is written to stdout.
    [string]$OutFile,

    # Conversion method: auto (default), ai, or browser. Use browser for JS-heavy pages.
    [ValidateSet('auto', 'ai', 'browser')]
    [string]$Method = 'auto',

    # Keep image URLs in the output (default: images stripped).
    [switch]$RetainImages
)

# Build query string from options.
$qs = [System.Collections.Generic.List[string]]::new()
if ($Method -and $Method -ne 'auto') { $qs.Add("method=$Method") }
if ($RetainImages) { $qs.Add('retain_images=true') }
$target = "https://markdown.new/$Url"
if ($qs.Count -gt 0) { $target += '?' + ($qs -join '&') }

Write-Verbose "Requesting: $target"
$response = Invoke-WebRequest -Uri $target -MaximumRedirection 5 -ErrorAction Stop

if ($OutFile) {
    Set-Content -LiteralPath $OutFile -Value $response.Content -Encoding utf8
    Write-Host "Written to $OutFile"
} else {
    Write-Output $response.Content
}
