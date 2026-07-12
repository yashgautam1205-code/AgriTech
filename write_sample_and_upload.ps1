$base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYGWNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
[System.IO.File]::WriteAllBytes("C:\codes\sample.png", [System.Convert]::FromBase64String($base64))
Write-Host "Wrote C:\codes\sample.png"
# Upload using curl.exe
curl.exe -F "image=@C:\codes\sample.png" -F "userId=anonymous" http://localhost:4000/api/upload-crop-image
