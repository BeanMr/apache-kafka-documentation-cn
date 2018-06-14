require(["gitbook"], function(gitbook) {
    gitbook.events.bind("start", function(e, config) {
        var baidu_gio = config.baidu_gio || {};
        var _hmt = _hmt || [];
        (function() {
         var hm = document.createElement("script");
         hm.src = '//hm.baidu.com/hm.js?' + baidu_gio['token'];
         var s = document.getElementsByTagName("script")[0]; 
         s.parentNode.insertBefore(hm, s);
        })();
  
    });
});
