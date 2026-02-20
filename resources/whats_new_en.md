**Changes and New Features in Program Version 3.1**

Version 3.1 introduces the online version of HALOpy. The program now supports two operating modes:

- Cloud Mode (online version): HALOpy can be operated as a database-based multi-user system. Users authenticate at startup with username and password. Each user has write access only to their own observations and observer data; administrators can edit all data. A logout button in the navigation bar ends the session. The 'File' menu is not available, as data management is handled through the database.
- Upload/Download of observations: In both operating modes, observations can be uploaded to or downloaded from the server. In local mode, prior authentication is required.
- Upload/Download of observer data: Analogous to observations, observer data can be uploaded and downloaded. In local mode, prior authentication is required.
- Change password: In cloud mode, the user's own password can be changed via the 'Settings' menu.

Local mode (file-based operation) remains fully available and works as before. The only additions in local mode are the new upload and download functions.

**Changes and New Features in Program Version 3.0**

Version 3.0 is a complete reprogramming of the original DOS program. We have adhered as closely as possible to the proven original program and made changes only where technically necessary (e.g., replacing DOS-dependent functions with web equivalents).

- Web platform and OS independence: Web application, operation completely in the browser; no longer tied to DOS (no DOS printer or color settings).
- Data handling: CSV only – both observation files (*.NAL) and observer file (HALO.BEO) are now in CSV format; no adapt/transfer/export of legacy HAL files in the program, no directory switching needed.
- Display/Analysis: Analysis in the browser with three text formats (HTML tables, pseudographics like DOS, Markdown), save as CSV/TXT/MD, graphics as PNG.
- Output: Monthly report, monthly and annual statistics as browser pages, same text format as above selectable; output destination (screen/print/file) is selected in the result view, printing via browser.
- Filter dialogs: All filter and parameter queries are bundled in one window instead of multiple sequential dialogs.
- Internationalization: German/English from the same sources, language switching at runtime.
- Program exit: No end menu anymore; exit by closing the browser window/tab.

**Changes and New Features in Program Version 2.5**

Version 2.5 is a bug fix for Halo.
In the analysis of observations with the month as parameter, the output of the year was corrected.
When two files are concatenated the program checks, whether both files are sorted correctly. If not, they will be resorted after a warning.
The halo types EE 41-43 were renamed to 90 deg parhelia according the current halo key. Furthermore, the new halo types EE 73-76 (120 deg subparhelia) and EE-77 (Moilanen arc) were added.
Problems with the font in graphic mode were fixed. 
Halo activity is only computed for halos in cirrus clouds.
The only new feature is the 'Export' function in the file menu. It writes all observations into a text file and enables you to analyze them with other software (e.g. EXCEL).

**Changes and New Features in Program Version 2.4**

Version 2.4 is an update of the 'Halo' software that contains only a few minor modifications. A number of bugs were fixed and actual changes in the halo key were implemented.

The following things were modified:
When printing monthly reports or statistics, occasionally some layout problems occurred. These problems are fixed now.
In the previous version of the software the halo activity was computed incorrectly for the annual statistics. The numbers differed from the activity index that was given in the monthly statistics. This bug is fixed now. Only observations from the primary or secondary observing site in Germany or one of the neighbor countries are considered for the computation of the activity index.
The key element 'cirrus thickness' was renamed to 'halo source' and completed by the new elements 'white frost', 'snow cover', 'ice nebulae/polar snow' and 'virga, snow fall'.
Finally, the observing site has become an extra sort key for halo observations. Two observations are equal, if the date, time, observer, halo type, and observing site are the same. That is, groups of observers with the same observer id can now report halo at the same time from different observing sites.

**Changes and New Features in Program Version 2.3**

The main point of the update was the introduction of geographic coordinates for the primary and secondary observing places of each observer. They are now stored together with the name and the observing area and allow a more accurate calculation of the Sun's altitude at the observation time.
The number of criterions for the selection of observations was increased. Now, a file of halo observations can be splitted according to all parameters that are available for the analysis of observations.
Finally, a little bug of the graphic analysis was fixed. Sometimes the axis got wrong labels, when there were parameters involved that can be coded in two different ways (i.e. EE 02 as 02 or 04). Now the labels are computed correctly.

**Changes and New Features in Program Version 2.2**

This is the first update that serves both German and English speaking observers. In addition, there have been some slight modifications to the previous German version, but these are not of interest to you since this is the first English program version.
As you can imagine this program translation was a complex operation which influenced all parts of the program. I cannot be completely sure that I really translated all the German text strings. So, if you encounter some non-English strings in prints, displays or graphs, please inform me.
