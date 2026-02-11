Delete Windows reserved `nul` files from the current directory.

Windows reserved filenames (`nul`, `con`, `aux`, `prn`, etc.) cannot be deleted with standard shell commands. The Win32 `kernel32.DeleteFileW` API with the `\\?\` extended-length path prefix is required, and a Python script file avoids bash/PowerShell backslash escaping issues.

## Steps

1. Write this Python script to `delete_nul.py` in the current working directory:

```python
import ctypes
import os
import sys

cwd = os.getcwd()
path = f"\\\\?\\{cwd}\\nul"
k = ctypes.windll.kernel32
result = k.DeleteFileW(path)
error = k.GetLastError()

if result != 0:
    print("nul file deleted successfully.")
else:
    print(f"Failed to delete nul. Win32 error code: {error}")
    sys.exit(1)
```

2. Run the script using forward slashes in the path to avoid bash mangling:

```
python ./delete_nul.py
```

3. Delete the helper script after it runs:

```
python -c "import os; os.remove('delete_nul.py')"
```

4. Run `git status --short` to confirm the `nul` file is no longer listed.

Report the result to the user.
