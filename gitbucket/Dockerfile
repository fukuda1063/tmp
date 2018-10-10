FROM java:latest

ADD https://github.com/gitbucket/gitbucket/releases/download/4.17.0/gitbucket.war /tmp/gitbucket.war

WORKDIR /opt
RUN mkdir gitbucket-4.17.0 && mv /tmp/gitbucket.war gitbucket-4.17.0/ && chown -R root:root gitbucket-4.17.0 && ln -s gitbucket-4.17.0 gitbucket && mkdir /home/gitbucket

EXPOSE 8080

CMD ["java","-jar", "/opt/gitbucket/gitbucket.war", "--port=8080", "--prefix=/gitbucket", "--host=127.0.0.1", "--gitbucket.home=/home/gitbucket"]
