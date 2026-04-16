# Nm tool
Uses `nm` and `objdump` from (GNU Binutils)[https://www.gnu.org/software/binutils/] to inspect binaries and display information.

## How to use
Compile a `*.elf` file, the nm tool will automatically update the information. If that did not happen try running the `Nm tool: Reload` command in vscode. To use the tool with other file extensions you can configure the `nmTool.inputFiles` setting to set a global pattern, the default is `**/*.elf`.

## CMake intergration
The extension will search for a `CMakeCache.txt` in any parent directory of the file to analyze to search for `CMAKE_NM:FILEPATH` and `CMAKE_OBJDUMP:FILEPATH`. If this fails the default `nm` and `objdump` commands will be used.
