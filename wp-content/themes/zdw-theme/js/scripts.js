(function ($) {

    $(function () {
        $(".menu-trigger").click(function (e) {
            e.preventDefault();

            $(".header-nav").toggleClass("active");
            $(this).toggleClass("opened");
        });

        $(document).on('click', 'a[href^="#"]', function (event) {
            event.preventDefault();
            $('html, body').animate({
                scrollTop: $($.attr(this, 'href')).offset().top
            }, 500);
        });

        if (typeof lightbox !== 'undefined') {
            lightbox.option({
                'resizeDuration': 200,
                'albumLabel': '%1 / %2',
                'fadeDuration': 200,
                'imageFadeDuration': 0,
            })
        }

        $(".wp-block-gallery figure img").each(function () {
            const thisImage = $(this);
            const image_id = thisImage.data("id");

            $.getJSON(php_vars["mediaurl"] + image_id, function (data) {
                thisImage.wrap("<a href='" + data.source_url + "' data-lightbox='single-gallery'></a>");
            });
        });
    });

    function makeIntroVideos() {
        var width = window.innerWidth
            || document.documentElement.clientWidth
            || document.body.clientWidth;

        $(".intro").each(function () {
            let video = $(this).find("video");

            video.find("source").remove();

            if (width < 600) {
                video.append("<source src='" + video.data("video-mobile") + "' type='video/mp4'>");
                video.attr("poster", video.data("poster-mobile"));
            } else {
                video.append("<source src='" + video.data("video-desktop") + "' type='video/mp4'>");
                video.attr("poster", video.data("poster-desktop"));
            }
        })
    }

    makeIntroVideos();

    var resizeId;
    window.addEventListener('resize', function () {
        clearTimeout(resizeId);
        resizeId = setTimeout(doneResizing, 200);
    });

    function doneResizing() {
        makeIntroVideos();
    }

    // Detect scroll header
    var didScroll;
    var lastScrollTop = 0;
    var delta = 5;
    var navbarHeight = $('header').outerHeight();

    $(window).scroll(function (event) {
        didScroll = true;
    });

    setInterval(function () {
        if (didScroll) {
            hasScrolled();
            didScroll = false;
        }
    }, 250);

    function hasScrolled() {
        var st = $(window).scrollTop();

        // Make sure they scroll more than delta
        if (Math.abs(lastScrollTop - st) <= delta)
            return;

        // If they scrolled down and are past the navbar, add class .nav-up.
        // This is necessary so you never see what is "behind" the navbar.
        if (st > lastScrollTop && st > navbarHeight) {
            // Scroll Down
            $('header').removeClass('nav-down').addClass('nav-up');

        } else {
            // Scroll Up
            if (st + $(window).height() < $(document).height()) {
                $('header').removeClass('nav-up').addClass('nav-down');
            }

            if (st > 100) {
                $('header').addClass('nav-bg');
            } else {
                $('header').removeClass('nav-bg');
            }
        }

        lastScrollTop = st;
    }


})(jQuery);

