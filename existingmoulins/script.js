      
function openGmail() {
        var email = "moulinspharma@gmail.com";
        var subject = encodeURIComponent("Healthcare Partnership Inquiry");
        var body = encodeURIComponent("Dear Moulins Team,\n\nI’d love to explore a partnership opportunity with Moulins Pharmaceuticals. Please share more details.\n\nBest,\n[Your Name]");
        
        var gmailURL = "https://mail.google.com/mail/?view=cm&fs=1&to=" + email + "&su=" + subject + "&body=" + body;
        
        if (/Android/i.test(navigator.userAgent)) {
          window.location.href = "intent://compose?to=" + email + "&subject=" + subject + "&body=" + body + "#Intent;scheme=mailto;package=com.google.android.gm;end;";
        } else {
          window.open(gmailURL, "_blank");
        }
      }
    
