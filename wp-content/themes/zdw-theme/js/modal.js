(function ($) {

    $(function () {

        function closeModal() {
            $("#newsletter-modal").removeClass("active");
            $("body").removeClass("modal-open");
            sessionStorage.setItem("modalClosed", "true");
        }

        if(sessionStorage.getItem("modalClosed") == null) {
            setTimeout(function () {
                $("#newsletter-modal").addClass("active");
                $("body").addClass("modal-open");
            }, 5000);
        }

        $(".modal-close").click(closeModal);

        $(document).keyup(function(e) {
            if (e.keyCode == 27) {
                closeModal();
            }
        });

        $("#newsletter-modal a").click(function() {
            sessionStorage.setItem("modalClosed", "true");
        })
    });

})(jQuery);