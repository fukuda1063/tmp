all:
	/usr/local/texlive/2017/bin/x86_64-linux/platex sample.tex
	#/usr/local/texlive/2017/bin/x86_64-linux/pbibtex sample
	/usr/local/texlive/2017/bin/x86_64-linux/platex sample.tex
	/usr/local/texlive/2017/bin/x86_64-linux/platex sample.tex
	/usr/local/texlive/2017/bin/x86_64-linux/dvipdfmx sample.dvi

clean:
	rm *.aux *.pdf *.dvi *.log
